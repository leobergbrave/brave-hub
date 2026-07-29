import { createClient } from '@supabase/supabase-js';
import { calcularFrete } from './_frete.js';
import { upsertCliente } from './_upsertCliente.js';

/* ═══════════════════════════════════════════════
   BRAVE HUB — API: Orçamento gerado numa Landing Page
   O cliente (frio) monta um orçamento na LP; aqui a gente:
     1) resolve cada item contra o catálogo real (tabela produtos)
     2) calcula o frete pelo CEP
     3) salva em orcamentos_salvos (aparece na aba de Orçamentos)
     4) registra/atualiza o lead em clientes + leads
     5) avisa o Léo no WhatsApp (mesmo webhook do Vigia)

   GET  /api/lp-orcamento?cep=01310100&peso=120   → prévia de frete
   POST /api/lp-orcamento  { origem, titulo, nome, telefone, cep, itens:[{alias|sku|nome, quantidade}] }
   ═══════════════════════════════════════════════ */

// alias curto usado nas LPs → nome do produto no banco (mesmo mapa do auto-orcamento)
const PRODUCT_ALIASES = {
  remo: 'Remo Indoor Profissional', rower: 'Remo Indoor Profissional',
  esteira: 'Esteira Curva Brave 2.0', esteiracurva: 'Esteira Curva Brave 2.0', estcv: 'Esteira Curva Brave 2.0',
  skierg: 'SkiErg com Plataforma', ski: 'SkiErg com Plataforma', airski: 'SkiErg com Plataforma',
  bikeerg: 'Bike Erg Brave', bike: 'Bike Erg Brave', bikerg: 'Bike Erg Brave',
  stormbike: 'STORM Bike Brave', storm: 'STORM Bike Brave', stmbike: 'STORM Bike Brave',
  escada: 'Escada Ergométrica - Painel de LED + Botões', stair: 'Escada Ergométrica - Painel de LED + Botões',
};

const CAPITAIS = {
  AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador', CE: 'Fortaleza',
  DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande',
  MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife', PI: 'Teresina',
  RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista',
  SC: 'Florianópolis', SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas',
};

const norm = (s) => (s || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

async function resolverCep(cepLimpo) {
  try {
    const j = await (await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)).json();
    if (j.erro) return null;
    const estado = j.uf || '';
    const cidade = j.localidade || '';
    const capital = CAPITAIS[estado];
    const zona = capital && cidade && cidade.toLowerCase() !== capital.toLowerCase() ? 'INTERIOR 1' : 'CAPITAL';
    return { estado, zona, cidade };
  } catch { return null; }
}

async function buscarRegra(supabase, estado, zona) {
  const { data: exata } = await supabase.from('regras_frete')
    .select('multiplicador, valor_minimo').eq('estado', estado).eq('zona', zona).maybeSingle();
  if (exata) return exata;
  const { data: fb } = await supabase.from('regras_frete')
    .select('multiplicador, valor_minimo').eq('estado', estado).limit(1).maybeSingle();
  return fb || null;
}

// Encontra a linha real do produto (por alias→nome, sku, ou nome parcial)
function resolverProduto(item, todos) {
  const chave = norm(item.alias || item.sku || item.nome);
  const chaveSemSep = chave.replace(/[\s_-]/g, '');
  const nomeAlias = PRODUCT_ALIASES[chaveSemSep];
  if (nomeAlias) {
    const p = todos.find(x => norm(x.nome) === norm(nomeAlias));
    if (p) return p;
  }
  if (item.sku) {
    const p = todos.find(x => norm(x.codigo_sku) === norm(item.sku));
    if (p) return p;
  }
  // nome exato, depois parcial
  return todos.find(x => norm(x.nome) === chave)
    || todos.find(x => norm(x.nome).includes(chave) && chave.length >= 4)
    || null;
}

async function avisarWhatsApp(payload) {
  const url = process.env.BOTCONVERSA_WEBHOOK
    || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/BKf6LUAsGAKO/';
  const telefone = process.env.ALERTA_TELEFONE || '5548996459791';
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telefone, ...payload }),
    });
    return true;
  } catch (e) {
    console.error('[lp-orcamento] webhook falhou:', e.message);
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  );

  // ── GET: prévia de frete por CEP + peso ──
  if (req.method === 'GET') {
    const cepLimpo = String(req.query.cep || '').replace(/\D/g, '');
    const peso = Number(req.query.peso) || 0;
    if (cepLimpo.length !== 8) return res.status(200).json({ ok: false, error: 'CEP inválido' });
    const loc = await resolverCep(cepLimpo);
    if (!loc) return res.status(200).json({ ok: false, error: 'CEP não encontrado' });
    const regra = await buscarRegra(supabase, loc.estado, loc.zona);
    const frete = calcularFrete(peso, regra);
    return res.status(200).json({ ok: true, frete, ...loc });
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Método não permitido' });

  try {
    const { origem = 'lp', titulo = 'Landing Page', nome, telefone, cep, itens } = req.body || {};

    const telLimpo = (telefone || '').replace(/\D/g, '');
    if (!nome || !nome.trim()) return res.status(400).json({ ok: false, error: 'Informe seu nome' });
    if (telLimpo.length < 10)  return res.status(400).json({ ok: false, error: 'WhatsApp inválido' });
    if (!Array.isArray(itens) || itens.length === 0) return res.status(400).json({ ok: false, error: 'Selecione ao menos um produto' });

    // 1) catálogo real
    const { data: todos } = await supabase.from('produtos')
      .select('id, codigo_sku, nome, preco, preco_avista, preco_prazo, peso_kg, url_imagem');
    if (!todos || !todos.length) return res.status(500).json({ ok: false, error: 'Catálogo indisponível' });

    // 2) resolve cada item contra o catálogo (id real é obrigatório p/ a página de orçamento)
    const itensResolvidos = [];
    const naoResolvidos = [];
    for (const it of itens) {
      const prod = resolverProduto(it, todos);
      const qtd = Math.max(1, parseInt(it.quantidade) || 1);
      if (prod) {
        itensResolvidos.push({
          id: prod.id,
          nome: prod.nome,
          codigo_sku: prod.codigo_sku || '',
          url_imagem: prod.url_imagem || '',
          quantidade: qtd,
          q: qtd,
          preco: Number(prod.preco) || 0,
          preco_avista: prod.preco_avista != null ? Number(prod.preco_avista) : null,
          preco_prazo: prod.preco_prazo != null ? Number(prod.preco_prazo) : null,
          peso_kg: Number(prod.peso_kg) || 0,
        });
      } else {
        naoResolvidos.push(it.nome || it.alias || it.sku);
      }
    }
    if (itensResolvidos.length === 0) {
      return res.status(400).json({ ok: false, error: 'Não consegui identificar os produtos', naoResolvidos });
    }

    // 3) frete pelo CEP
    const pesoTotal = itensResolvidos.reduce((a, i) => a + i.peso_kg * i.quantidade, 0);
    let estado = '', zona = 'CAPITAL', cidade = '', frete = 0;
    const cepLimpo = (cep || '').replace(/\D/g, '');
    if (cepLimpo.length === 8) {
      const loc = await resolverCep(cepLimpo);
      if (loc) {
        estado = loc.estado; zona = loc.zona; cidade = loc.cidade;
        frete = calcularFrete(pesoTotal, await buscarRegra(supabase, estado, zona));
      }
    }

    // 4) salva orçamento (mesmo formato da vitrine do cliente)
    const subtotal = itensResolvidos.reduce((a, i) => a + (i.preco_avista ?? i.preco) * i.quantidade, 0);
    const slugBase = norm(nome).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'lead';
    const slug = `${slugBase}-${Math.random().toString(36).slice(2, 8)}`;

    const payload = {
      itens: itensResolvidos,
      estado, zona, frete,
      telefoneCliente: telLimpo,
      origem,
      condicoes: { descontoAvista: 0, descontoCartao: 0, parcelas: 10, personalizarPorProduto: false },
    };

    const { error: insErr } = await supabase.from('orcamentos_salvos').insert({
      slug, cliente: nome.trim(), consultor: 'Léo Berg', payload,
    });
    if (insErr) return res.status(500).json({ ok: false, error: 'Erro ao salvar: ' + insErr.message });

    // 5) registra o lead (cliente + tabela leads) — sem travar a resposta se falhar
    try {
      await upsertCliente(supabase, { nome: nome.trim(), telefone: telLimpo, origem });
      await supabase.from('leads').insert({ nome: nome.trim(), telefone: telLimpo, status: 'novo', origem_lead: origem });
    } catch (e) { console.error('[lp-orcamento] lead:', e.message); }

    // 6) link + total + aviso no WhatsApp
    const baseUrl = req.headers['x-forwarded-host'] ? `https://${req.headers['x-forwarded-host']}`
      : req.headers.host ? `https://${req.headers.host}` : 'https://brave-hub-two.vercel.app';
    const link = `${baseUrl}/orcamento/${slug}`;
    const totalAvista = subtotal + frete;
    const resumoItens = itensResolvidos.map(i => `${i.quantidade}x ${i.nome}`).join(', ');

    await avisarWhatsApp({
      nome: nome.trim(),
      telefone_lead: telLimpo,
      titulo: `Novo orçamento na LP — ${titulo}`,
      origem,
      produtos: resumoItens,
      qtd_itens: itensResolvidos.length,
      total: totalAvista,
      cidade, estado,
      link,
      alerta: `🔥 ${nome.trim()} montou um orçamento (${titulo})! ${resumoItens}. Total ~${totalAvista.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}. Fale já: ${link}`,
    });

    return res.status(200).json({
      ok: true, slug, link,
      frete, subtotal, total: totalAvista,
      itens: itensResolvidos.length,
      naoResolvidos: naoResolvidos.length ? naoResolvidos : undefined,
    });
  } catch (err) {
    console.error('[lp-orcamento] erro:', err);
    return res.status(500).json({ ok: false, error: 'Erro interno: ' + err.message });
  }
}
