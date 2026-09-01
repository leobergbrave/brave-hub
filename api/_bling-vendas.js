import { createClient } from '@supabase/supabase-js';

/* Soma os pedidos de venda do Bling num periodo, para conferir contra os
   numeros do painel de vendas. Devolve total e contagem, e uma quebra por
   SITUACAO — porque "vendas realizadas / ganhas" costuma excluir rascunho e
   cancelado, e so vendo a quebra da para bater com o painel.
   GET /api/bling?acao=vendas_periodo&ini=YYYY-MM-DD&fim=YYYY-MM-DD  (x-hub-token) */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getValidToken() {
  const { data: config } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
  if (!config) return null;
  const teste = await fetch('https://api.bling.com.br/v3/contatos?limite=1', {
    headers: { Authorization: `Bearer ${config.access_token}`, Accept: '1.0' },
  });
  if (teste.status !== 401) return config.access_token;
  const cred = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
  const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${cred}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refresh_token }),
  });
  if (!r.ok) return null;
  const t = await r.json();
  await supabaseAdmin.from('bling_config').update({
    access_token: t.access_token, refresh_token: t.refresh_token, updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return t.access_token;
}

export async function vendasPeriodo(req, res) {
  if (req.headers['x-hub-token'] !== process.env.HUB_PDF_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Token invalido.' });
  }
  const ini = String(req.query?.ini || '').slice(0, 10);
  const fim = String(req.query?.fim || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    return res.status(400).json({ ok: false, error: 'use ini e fim no formato YYYY-MM-DD.' });
  }
  const token = await getValidToken();
  if (!token) return res.status(500).json({ ok: false, error: 'Sem token Bling.' });

  // Nomes de situacao pelo id (o pedido traz situacao.id, nem sempre o texto)
  let nomeSituacao = {};
  try {
    const r = await fetch('https://api.bling.com.br/v3/situacoes/modulos', {
      headers: { Authorization: `Bearer ${token}`, Accept: '1.0' },
    });
    if (r.ok) {
      const mods = (await r.json())?.data || [];
      const vendas = mods.find((m) => /venda/i.test(m?.nome || ''));
      for (const s of vendas?.situacoes || []) nomeSituacao[s.id] = s.nome;
    }
  } catch (_) { /* segue sem nomes */ }

  const porSituacao = {};
  let total = 0;
  let qtd = 0;
  let pagina = 1;
  const MAX_PAG = 40;
  for (; pagina <= MAX_PAG; pagina++) {
    const url = `https://api.bling.com.br/v3/pedidos/vendas?dataInicial=${ini}&dataFinal=${fim}&pagina=${pagina}&limite=100`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: '1.0' } });
    if (!r.ok) {
      if (pagina === 1) return res.status(200).json({ ok: false, error: `Bling HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` });
      break;
    }
    const lista = (await r.json())?.data || [];
    if (!lista.length) break;
    for (const p of lista) {
      const v = Number(p.total) || 0;
      const sid = p.situacao?.id ?? 0;
      const chave = nomeSituacao[sid] || `situacao ${sid}`;
      if (!porSituacao[chave]) porSituacao[chave] = { qtd: 0, total: 0 };
      porSituacao[chave].qtd += 1;
      porSituacao[chave].total += v;
      total += v; qtd += 1;
    }
    if (lista.length < 100) break;
    await sleep(350);
  }

  const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const quebra = Object.entries(porSituacao)
    .map(([s, o]) => ({ situacao: s, qtd: o.qtd, total: o.total, total_fmt: brl(o.total) }))
    .sort((a, b) => b.total - a.total);

  return res.status(200).json({
    ok: true, periodo: { ini, fim },
    total_geral: total, total_geral_fmt: brl(total), qtd_geral: qtd,
    por_situacao: quebra,
    paginas_lidas: pagina,
  });
}
