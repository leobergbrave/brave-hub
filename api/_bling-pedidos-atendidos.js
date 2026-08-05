import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/bling?acao=pedidos_atendidos
 * Body: { modo?: 'listar' | 'enviar', dias?: number }
 *
 * Varre os pedidos de venda do Bling que estão em "Atendido" (situação 9) e
 * avisa o cliente no WhatsApp que o pedido foi despachado — com código de
 * rastreio quando o Bling tiver. Feito para rodar num cron a cada 15-30 min.
 *
 * Escopo: só pedidos do vendedor Léo Berg (é o recorte de "meus clientes";
 * o ID da proposta que guardamos em orcamentos_salvos.bling_pedido_id NÃO
 * serve aqui, porque proposta comercial e pedido de venda são entidades
 * diferentes no Bling).
 *
 * modo 'listar' (padrão) = simulação: mostra quem SERIA avisado, sem enviar
 * nada e sem marcar como avisado. Use para conferir antes de ligar o cron.
 */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const SITUACAO_ATENDIDO = 9;

// ── Token Bling (mesmo padrão dos outros módulos) ────────────────────────────
async function getValidToken() {
  const { data: config } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
  if (!config) return null;
  const teste = await fetch('https://api.bling.com.br/v3/pedidos/vendas?limite=1&pagina=1', {
    headers: { Authorization: `Bearer ${config.access_token}`, Accept: '1.0' },
  });
  if (teste.status !== 401) return config.access_token;

  const credentials = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
  const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refresh_token }),
  });
  if (!r.ok) return null;
  const t = await r.json();
  await supabaseAdmin.from('bling_config').update({
    access_token: t.access_token, refresh_token: t.refresh_token, updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return t.access_token;
}

const blingGet = (path, token) =>
  fetch(`https://api.bling.com.br/v3${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: '1.0' } });

// ── Vendedor Léo (env manda; senão acha pelo nome sem acento) ────────────────
async function idDoLeo(token) {
  const fixo = process.env.BLING_VENDEDOR_ID;
  if (fixo) return isNaN(Number(fixo)) ? fixo : Number(fixo);
  const r = await blingGet('/vendedores?limite=100', token);
  if (!r.ok) return null;
  const j = await r.json();
  const alvo = semAcento('Leo Berg');
  const v = (j?.data || []).find(x => semAcento(x?.contato?.nome) === alvo);
  return v?.id || null;
}

// ── Rastreio: o Bling guarda em transporte.volumes[].codigoRastreamento ──────
function extrairRastreio(detalhe) {
  const vols = detalhe?.transporte?.volumes;
  if (!Array.isArray(vols)) return { codigo: '', url: '' };
  const vol = vols.find(v => v?.codigoRastreamento) || {};
  const codigo = String(vol.codigoRastreamento || '').trim();
  return {
    codigo,
    // link só quando o formato bate com o padrão dos Correios (AA123456789BR)
    url: /^[A-Z]{2}\d{9}[A-Z]{2}$/i.test(codigo)
      ? `https://rastreamento.correios.com.br/app/index.php?objetos=${codigo}`
      : '',
  };
}

async function avisar(url, corpo) {
  try {
    const r = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
    });
    return r.ok;
  } catch (_) { return false; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const modo = req.body?.modo || req.query?.modo || 'listar';
  const dias = Number(req.body?.dias || req.query?.dias || 7);

  const token = await getValidToken();
  if (!token) return res.status(200).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });

  const vendedorLeo = await idDoLeo(token);
  if (!vendedorLeo) {
    return res.status(200).json({ ok: false, error: 'Vendedor Léo Berg não encontrado no Bling (ou defina BLING_VENDEDOR_ID).' });
  }

  // 1) pedidos alterados nos últimos N dias, do Léo.
  // Os filtros da v3 nem sempre são respeitados (o ?cpf_cnpj= de contatos é
  // ignorado, por exemplo), então TUDO é reconferido no nosso lado.
  const desde = new Date(Date.now() - dias * 86400000).toISOString().split('T')[0];
  const pedidos = [];
  for (let pagina = 1; pagina <= 5; pagina++) {
    await sleep(350);
    const r = await blingGet(
      `/pedidos/vendas?pagina=${pagina}&limite=100&dataAlteracaoInicial=${desde}&idVendedor=${vendedorLeo}`, token
    );
    if (!r.ok) break;
    const j = await r.json();
    const itens = j?.data || [];
    pedidos.push(...itens);
    if (itens.length < 100) break;
  }

  // filtro de verdade, no nosso lado
  const atendidos = pedidos.filter(p => Number(p?.situacao?.id) === SITUACAO_ATENDIDO);

  // 2) tira os que já avisamos
  const ids = atendidos.map(p => String(p.id));
  let jaAvisados = new Set();
  if (ids.length) {
    const { data } = await supabaseAdmin.from('pedidos_avisados').select('bling_pedido_id').in('bling_pedido_id', ids);
    jaAvisados = new Set((data || []).map(d => String(d.bling_pedido_id)));
  }
  const pendentes = atendidos.filter(p => !jaAvisados.has(String(p.id)));

  const urlCliente = process.env.BOTCONVERSA_PEDIDO_ENVIADO_WEBHOOK || null;
  const urlLeo = process.env.BOTCONVERSA_WEBHOOK
    || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/BKf6LUAsGAKO/';
  const telLeo = process.env.ALERTA_TELEFONE || '5548996459791';

  const resultado = [];
  for (const p of pendentes) {
    await sleep(300);
    const det = await blingGet(`/pedidos/vendas/${p.id}`, token);
    const detalhe = det.ok ? (await det.json())?.data : null;

    const docPedido = soDigitos(detalhe?.contato?.numeroDocumento || p?.contato?.numeroDocumento);
    const nome = detalhe?.contato?.nome || p?.contato?.nome || 'Cliente';

    // telefone: primeiro da nossa base (mais confiável), senão o do contato Bling
    let telefone = '';
    if (docPedido) {
      const { data } = await supabaseAdmin.from('clientes').select('telefone').eq('cpf_cnpj', docPedido).maybeSingle();
      telefone = soDigitos(data?.telefone);
    }
    if (!telefone && detalhe?.contato?.id) {
      await sleep(250);
      const c = await blingGet(`/contatos/${detalhe.contato.id}`, token);
      if (c.ok) {
        const cj = (await c.json())?.data;
        telefone = soDigitos(cj?.celular || cj?.telefone);
      }
    }

    const { codigo, url } = extrairRastreio(detalhe);
    const numero = detalhe?.numero || p?.numero || '';
    const item = { pedidoId: String(p.id), numero, nome, telefone, rastreio: codigo, linkRastreio: url };

    if (modo !== 'enviar') { resultado.push({ ...item, acao: 'simulado' }); continue; }

    if (!telefone || telefone.length < 10) {
      resultado.push({ ...item, acao: 'sem-telefone' });
      continue;
    }
    const telefoneFull = telefone.startsWith('55') ? telefone : '55' + telefone;

    let enviado = false;
    if (urlCliente) {
      enviado = await avisar(urlCliente, {
        telefone: telefoneFull, nome, numero_pedido: numero,
        rastreio: codigo, link_rastreio: url,
      });
    }

    // aviso paralelo pro Léo
    await avisar(urlLeo, {
      telefone: telLeo, nome, titulo: 'Pedido enviado', qtd_pendentes: 1, link: url,
      alerta: `📦 Pedido #${numero} de ${nome} saiu para entrega${codigo ? ` · rastreio ${codigo}` : ''}. ${enviado ? 'Cliente avisado ✅' : '⚠️ Cliente NÃO avisado (automação de cliente não configurada)'}`,
    });

    if (enviado) {
      await supabaseAdmin.from('pedidos_avisados').insert({
        bling_pedido_id: String(p.id), numero: String(numero), cliente_nome: nome,
        telefone: telefoneFull, rastreio: codigo || null,
      });
    }
    resultado.push({ ...item, acao: enviado ? 'enviado' : 'falhou' });
  }

  return res.status(200).json({
    ok: true,
    modo,
    vendedor: vendedorLeo,
    pedidosVarridos: pedidos.length,
    atendidos: atendidos.length,
    jaAvisados: atendidos.length - pendentes.length,
    processados: resultado.length,
    resultado,
    ...(modo === 'enviar' && !urlCliente
      ? { aviso: 'BOTCONVERSA_PEDIDO_ENVIADO_WEBHOOK não configurado — o cliente não foi avisado.' }
      : {}),
  });
}
