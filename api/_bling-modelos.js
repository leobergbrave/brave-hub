import { createClient } from '@supabase/supabase-js';
import { calcularFrete } from './_frete.js';

/* ═══════════════════════════════════════════════
   BRAVE HUB — API: Modelos de Orçamento (Bling)
   POST /api/modelos?acao=importar
     body: { numeros: [3747, 5933, ...] }
   POST /api/modelos?acao=gerar_orcamento
     body: { modelo_id, nome, cep, telefone, desconto_avista, desconto_cartao, parcelas, consultor }
   POST /api/modelos?acao=gerar_proposta
     body: { modelo_id, nome, telefone, desconto_avista, vendedor_telefone, validade_em, objetivo, mensagem }

   Puxa "orçamentos modelo" (propostas comerciais) do Bling,
   casa os itens com o catálogo local e salva como modelos
   reutilizáveis. A partir de um modelo, gera tanto o link de
   orçamento (/orcamento/{slug}) quanto a proposta premium (/pp/{slug}).
   ═══════════════════════════════════════════════ */

export const config = { maxDuration: 60 };

const VENDEDOR_TEL_PADRAO = '5531973446109'; // Léo Berg
const BLING_API = 'https://api.bling.com.br/v3';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Bling token (self-healing, mesmo padrão de enviar-bling-pedido.js) ──
async function getBlingConfig() {
  const { data } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
  return data || null;
}
async function refreshBlingToken(config) {
  const creds = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
  const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refresh_token }),
  });
  if (!r.ok) return null;
  const td = await r.json();
  await supabaseAdmin.from('bling_config').update({
    access_token: td.access_token,
    refresh_token: td.refresh_token,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return td.access_token;
}
async function getValidToken() {
  const config = await getBlingConfig();
  if (!config) return null;
  const test = await fetch(`${BLING_API}/contatos?limite=1`, {
    headers: { Authorization: `Bearer ${config.access_token}`, Accept: '1.0' },
  });
  if (test.status === 401) return await refreshBlingToken(config);
  return config.access_token;
}
function blingGet(url, token) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: '1.0' } });
}

// ── Catálogo local indexado por bling_id e codigo_sku ──
async function carregarCatalogo() {
  const { data } = await supabaseAdmin
    .from('produtos')
    .select('id, nome, codigo_sku, bling_id, preco, preco_avista, preco_prazo, peso_kg, url_imagem');
  const byBling = new Map();
  const bySku = new Map();
  for (const p of data || []) {
    if (p.bling_id) byBling.set(String(p.bling_id), p);
    if (p.codigo_sku) bySku.set(String(p.codigo_sku).toLowerCase(), p);
  }
  return { lista: data || [], byBling, bySku };
}

// ══════════════ AÇÃO: IMPORTAR ══════════════
export async function importar(req, res) {
  const brutos = req.body?.numeros;
  const alvos = [...new Set(
    (Array.isArray(brutos) ? brutos : String(brutos || '').split(/[\s,;]+/))
      .map((n) => parseInt(String(n).replace(/\D/g, ''), 10))
      .filter((n) => Number.isFinite(n) && n > 0)
  )];
  if (alvos.length === 0) {
    return res.status(400).json({ ok: false, error: 'Informe ao menos um número de proposta.' });
  }

  const token = await getValidToken();
  if (!token) return res.status(500).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });

  // 1) Varre a lista (desc por número) montando índice numero → proposta.
  //    Os filtros por número do Bling não funcionam, então paginamos até
  //    achar todos os alvos ou passar do menor número pedido.
  const menorAlvo = Math.min(...alvos);
  const encontradas = new Map();
  const LIMITE = 100;
  const MAX_PAG = 80;
  let pagina = 1;
  while (pagina <= MAX_PAG) {
    const r = await blingGet(`${BLING_API}/propostas-comerciais?limite=${LIMITE}&pagina=${pagina}`, token);
    if (!r.ok) break;
    const lista = (await r.json()).data || [];
    if (lista.length === 0) break;
    let minNum = Infinity;
    for (const p of lista) {
      const n = Number(p.numero);
      if (n < minNum) minNum = n;
      if (alvos.includes(n) && !encontradas.has(n)) encontradas.set(n, p);
    }
    if (encontradas.size >= alvos.length) break;
    if (minNum < menorAlvo) break;
    pagina += 1;
    await sleep(360);
  }

  const catalogo = await carregarCatalogo();
  const resultados = [];

  // 2) Para cada número: detalhe → mapeia itens → upsert do modelo.
  for (const num of alvos) {
    const head = encontradas.get(num);
    if (!head) {
      resultados.push({ numero: num, ok: false, motivo: 'Proposta não encontrada no Bling (confira o número).' });
      continue;
    }
    await sleep(360);
    const dr = await blingGet(`${BLING_API}/propostas-comerciais/${head.id}`, token);
    if (!dr.ok) {
      resultados.push({ numero: num, ok: false, motivo: `Erro ao ler detalhe da proposta (HTTP ${dr.status}).` });
      continue;
    }
    const prop = (await dr.json()).data || {};

    const itens = [];
    const faltantes = [];
    for (const it of prop.itens || []) {
      const bid = it.produto?.id ? String(it.produto.id) : '';
      const cod = (it.codigo || '').toLowerCase();
      const p = (bid && catalogo.byBling.get(bid)) || (cod && catalogo.bySku.get(cod)) || null;
      const qtd = Number(it.quantidade) || 1;
      if (!p) {
        faltantes.push({
          descricao: it.produto?.descricao || it.codigo || 'Item sem nome',
          codigo: it.codigo || '',
          bling_id: it.produto?.id || 0,
          quantidade: qtd,
          valor: it.valor || 0,
        });
        continue;
      }
      itens.push({
        produto_id: p.id,
        quantidade: qtd,
        codigo: p.codigo_sku || '',
        nome: p.nome,
        preco: p.preco,
        peso_kg: p.peso_kg || 0,
        url_imagem: p.url_imagem || '',
        bling_id: p.bling_id,
      });
    }

    const primeiraLinha = String(prop.introducao || '').split(/\r?\n/)[0].trim();
    const titulo = primeiraLinha.replace(/^proposta\s+comercial\s*[–:-]*\s*/i, '').trim();
    const nome = titulo ? `${titulo} (#${num})` : `Proposta #${num}`;

    const row = {
      nome,
      descricao: `Importado do Bling · ${itens.length} itens${faltantes.length ? ` · ${faltantes.length} sem vínculo` : ''}`,
      itens,
      consultor: 'Léo Berg',
      bling_proposta_id: head.id,
      bling_proposta_numero: num,
      introducao: prop.introducao || '',
      total_bling: prop.total || 0,
      itens_faltantes: faltantes,
      ativo: true,
      atualizado_em: new Date().toISOString(),
    };

    const { data: existente } = await supabaseAdmin
      .from('orcamentos_modelo').select('id').eq('bling_proposta_id', head.id).maybeSingle();

    let err;
    if (existente) {
      ({ error: err } = await supabaseAdmin.from('orcamentos_modelo').update(row).eq('id', existente.id));
    } else {
      ({ error: err } = await supabaseAdmin.from('orcamentos_modelo').insert(row));
    }

    resultados.push({
      numero: num,
      ok: !err,
      atualizado: !!existente,
      nome,
      itens: itens.length,
      faltantes: faltantes.length,
      faltantesDetalhe: faltantes,
      erro: err?.message,
    });
  }

  return res.status(200).json({ ok: true, resultados, paginasVarridas: pagina });
}

// ── Resolve CEP → estado/zona (mesma lógica de auto-orcamento.js) ──
async function resolverCep(cep) {
  const cepLimpo = String(cep || '').replace(/\D/g, '');
  if (cepLimpo.length !== 8) return { estado: '', zona: 'CAPITAL' };
  const capitais = {
    AC: 'Rio Branco', AL: 'Maceió', AP: 'Macapá', AM: 'Manaus', BA: 'Salvador', CE: 'Fortaleza',
    DF: 'Brasília', ES: 'Vitória', GO: 'Goiânia', MA: 'São Luís', MT: 'Cuiabá', MS: 'Campo Grande',
    MG: 'Belo Horizonte', PA: 'Belém', PB: 'João Pessoa', PR: 'Curitiba', PE: 'Recife', PI: 'Teresina',
    RJ: 'Rio de Janeiro', RN: 'Natal', RS: 'Porto Alegre', RO: 'Porto Velho', RR: 'Boa Vista',
    SC: 'Florianópolis', SP: 'São Paulo', SE: 'Aracaju', TO: 'Palmas',
  };
  try {
    const j = await (await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`)).json();
    if (j.erro) return { estado: '', zona: 'CAPITAL' };
    const estado = j.uf || '';
    const capital = capitais[estado];
    const zona = capital && j.localidade && j.localidade.toLowerCase() !== capital.toLowerCase() ? 'INTERIOR 1' : 'CAPITAL';
    return { estado, zona };
  } catch {
    return { estado: '', zona: 'CAPITAL' };
  }
}

async function carregarModelo(modeloId) {
  if (!modeloId) return null;
  const { data } = await supabaseAdmin.from('orcamentos_modelo').select('*').eq('id', modeloId).single();
  return data || null;
}

// Resolve os itens do modelo contra o catálogo atual (preços sempre atualizados).
async function resolverItensModelo(modelo) {
  const ids = [...new Set((modelo.itens || []).map((i) => i.produto_id || i.id).filter(Boolean))];
  if (ids.length === 0) return [];
  const { data: produtos } = await supabaseAdmin
    .from('produtos')
    .select('id, codigo_sku, nome, preco, preco_avista, preco_prazo, peso_kg, url_imagem')
    .in('id', ids);
  const map = new Map((produtos || []).map((p) => [p.id, p]));
  const out = [];
  for (const it of modelo.itens || []) {
    const p = map.get(it.produto_id || it.id);
    if (!p) continue;
    out.push({ ...p, quantidade: Number(it.quantidade) || 1 });
  }
  return out;
}

// ══════════════ AÇÃO: GERAR LINK DE ORÇAMENTO ══════════════
export async function gerarOrcamento(req, res) {
  const { modelo_id, nome, cep, telefone, consultor } = req.body || {};
  const descAvista = Number(req.body?.desconto_avista ?? 15);
  const descCartao = Number(req.body?.desconto_cartao ?? 0);
  const parcelas = Number(req.body?.parcelas ?? 10);

  const modelo = await carregarModelo(modelo_id);
  if (!modelo) return res.status(404).json({ ok: false, error: 'Modelo não encontrado.' });

  const produtos = await resolverItensModelo(modelo);
  if (produtos.length === 0) return res.status(400).json({ ok: false, error: 'Modelo sem itens vinculados ao catálogo.' });

  const { estado, zona } = await resolverCep(cep);

  // Regra de frete (zona exata → fallback estado)
  let regraFrete = null;
  if (estado) {
    const { data: exata } = await supabaseAdmin.from('regras_frete')
      .select('multiplicador, valor_minimo').eq('estado', estado).eq('zona', zona).maybeSingle();
    regraFrete = exata;
    if (!regraFrete) {
      const { data: fb } = await supabaseAdmin.from('regras_frete')
        .select('multiplicador, valor_minimo').eq('estado', estado).limit(1).maybeSingle();
      regraFrete = fb;
    }
  }
  const pesoTotal = produtos.reduce((a, i) => a + (i.peso_kg || 0) * i.quantidade, 0);
  const frete = calcularFrete(pesoTotal, regraFrete);

  const itensPayload = produtos.map((p) => ({
    id: p.id,
    nome: p.nome,
    preco: p.preco,
    preco_avista: p.preco_avista ?? null,
    preco_prazo: p.preco_prazo ?? null,
    peso_kg: p.peso_kg || 0,
    url_imagem: p.url_imagem || '',
    codigo_sku: p.codigo_sku || '',
    quantidade: p.quantidade,
    descontoAvistaItem: 0,
    descontoCartaoItem: 0,
  }));

  const nomeCliente = (nome || '').trim() || 'Cliente';
  const slugBase = nomeCliente.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'orcamento';
  const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;

  const payload = {
    itens: itensPayload,
    estado,
    zona,
    frete,
    telefoneCliente: (telefone || '').replace(/\D/g, ''),
    condicoes: { descontoAvista: descAvista, descontoCartao: descCartao, parcelas, personalizarPorProduto: false },
  };

  const { error } = await supabaseAdmin.from('orcamentos_salvos').insert({
    slug,
    cliente: nomeCliente,
    consultor: consultor || modelo.consultor || 'Léo Berg',
    payload,
    origem_lead: 'modelo_bling',
  });
  if (error) return res.status(500).json({ ok: false, error: 'Erro ao salvar orçamento: ' + error.message });

  const baseUrl = baseUrlDe(req);
  const subtotal = produtos.reduce((a, i) => a + i.preco * i.quantidade, 0);
  const totalAvista = round2(subtotal * (1 - descAvista / 100) + frete);
  return res.status(200).json({
    ok: true, slug, link: `${baseUrl}/orcamento/${slug}`,
    resumo: { itens: produtos.length, estado, zona, peso_kg: pesoTotal, frete, subtotal, total_avista: totalAvista },
  });
}

// ══════════════ AÇÃO: GERAR PROPOSTA PREMIUM ══════════════
export async function gerarProposta(req, res) {
  const { modelo_id, nome, telefone, validade_em } = req.body || {};
  const descAvista = Number(req.body?.desconto_avista ?? 15);
  const parcelas = Number(req.body?.parcelas ?? 10);
  const vendedorTel = (req.body?.vendedor_telefone || VENDEDOR_TEL_PADRAO).replace(/\D/g, '');

  const modelo = await carregarModelo(modelo_id);
  if (!modelo) return res.status(404).json({ ok: false, error: 'Modelo não encontrado.' });

  const produtos = await resolverItensModelo(modelo);
  if (produtos.length === 0) return res.status(400).json({ ok: false, error: 'Modelo sem itens vinculados ao catálogo.' });

  // Cada equipamento já embute a quantidade (o renderizador soma 1x por card).
  const equipamentos = produtos.map((p) => {
    const q = p.quantidade;
    const precoNormal = round2(p.preco * q);
    const precoAvistaUnit = p.preco_avista != null ? p.preco_avista : p.preco * (1 - descAvista / 100);
    const precoAvista = round2(precoAvistaUnit * q);
    return {
      nome: q > 1 ? `${p.nome} (${q}×)` : p.nome,
      descricao: '',
      specs: [],
      imagem_url: p.url_imagem || '',
      preco: precoNormal,
      preco_avista: precoAvista,
      parcelas,
      preco_parcela: round2(precoNormal / parcelas),
      destaque: false,
    };
  });

  // Frete por CEP (mesma lógica do orçamento; opcional)
  const { estado, zona } = await resolverCep(req.body?.cep);
  let regraFrete = null;
  if (estado) {
    const { data: exata } = await supabaseAdmin.from('regras_frete')
      .select('multiplicador, valor_minimo').eq('estado', estado).eq('zona', zona).maybeSingle();
    regraFrete = exata;
    if (!regraFrete) {
      const { data: fb } = await supabaseAdmin.from('regras_frete')
        .select('multiplicador, valor_minimo').eq('estado', estado).limit(1).maybeSingle();
      regraFrete = fb;
    }
  }
  const pesoTotal = produtos.reduce((a, i) => a + (i.peso_kg || 0) * i.quantidade, 0);
  const frete = calcularFrete(pesoTotal, regraFrete);

  const nomeLead = (nome || '').trim() || 'Cliente';
  const slugBase = nomeLead.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'proposta';
  const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;

  const primeiraLinha = String(modelo.introducao || '').split(/\r?\n/)[0].trim();
  const objetivo = (req.body?.objetivo || primeiraLinha.replace(/^proposta\s+comercial\s*[–:-]*\s*/i, '').trim() || 'sua proposta BRAVE');

  const { error } = await supabaseAdmin.from('propostas_leads').insert({
    slug,
    lead_nome: nomeLead,
    objetivo,
    mensagem_personalizada: req.body?.mensagem || modelo.introducao || null,
    equipamentos,
    frete,
    estado,
    validade_em: validade_em || null,
    vendedor_telefone: vendedorTel,
    status: 'enviada',
    modelo_id: modelo.id,
    telefone_lead: (telefone || '').replace(/\D/g, '') || null,
  });
  if (error) return res.status(500).json({ ok: false, error: 'Erro ao salvar proposta: ' + error.message });

  const baseUrl = baseUrlDe(req);
  const totalAvista = round2(equipamentos.reduce((a, e) => a + e.preco_avista, 0) + frete);
  return res.status(200).json({
    ok: true, slug, link: `${baseUrl}/pp/${slug}`,
    resumo: { equipamentos: equipamentos.length, estado, frete, total_avista: totalAvista },
  });
}

function baseUrlDe(req) {
  if (req.headers['x-forwarded-host']) return `https://${req.headers['x-forwarded-host']}`;
  if (req.headers.host) return `https://${req.headers.host}`;
  return 'https://brave-hub-two.vercel.app';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Use POST' });

  const acao = req.query?.acao || req.body?.acao;
  try {
    if (acao === 'importar') return await importar(req, res);
    if (acao === 'gerar_orcamento') return await gerarOrcamento(req, res);
    if (acao === 'gerar_proposta') return await gerarProposta(req, res);
    return res.status(400).json({ ok: false, error: 'Ação inválida. Use importar | gerar_orcamento | gerar_proposta.' });
  } catch (err) {
    console.error('[modelos] erro', acao, err);
    return res.status(500).json({ ok: false, error: 'Erro interno: ' + err.message });
  }
}
