// api/_vendas-lista.js — lista ITEMIZADA dos pedidos de venda de um vendedor
// (ou de todos) num periodo, direto do Bling. Mesma exposicao do
// analise_vendedores (sem x-hub-token): e o dono consultando as proprias vendas.
//
// GET /api/bling?acao=vendas_lista&ini=YYYY-MM-DD&fim=YYYY-MM-DD&vendedor=Léo%20Berg
import { createClient } from '@supabase/supabase-js';

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

async function blingGet(url, token, tentativas = 4) {
  for (let i = 1; i <= tentativas; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: '1.0' } });
    if (r.status === 429) { await sleep(1200 * i); continue; }
    return r;
  }
  return { ok: false, status: 429, text: async () => '429' };
}

const semAcento = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const CANCELADO = 12;

export async function vendasLista(req, res) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const ini = String(req.query?.ini || '').slice(0, 10);
    const fim = String(req.query?.fim || hoje).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      return res.status(400).json({ ok: false, error: 'use ini e fim no formato YYYY-MM-DD.' });
    }

    const token = await getValidToken();
    if (!token) return res.status(500).json({ ok: false, error: 'Sem token do Bling.' });

    // Filtro opcional por vendedor: resolve o id pelo nome (sem acento).
    let idVendedor = null; let vendedorNome = null;
    const alvo = semAcento(req.query?.vendedor || '');
    if (alvo) {
      const rv = await blingGet('https://api.bling.com.br/v3/vendedores', token);
      if (rv.ok) {
        const lista = ((await rv.json())?.data || []).filter((v) => (v?.contato?.nome || '').trim());
        const m = lista.find((v) => semAcento(v.contato.nome) === alvo)
          || lista.find((v) => semAcento(v.contato.nome).includes(alvo));
        if (m) { idVendedor = m.id; vendedorNome = m.contato.nome; }
      }
      if (!idVendedor) return res.status(200).json({ ok: false, error: `Vendedor "${req.query.vendedor}" nao encontrado no Bling.` });
      await sleep(400);
    }

    // Nomes de situacao pelo id (o pedido traz situacao.id, nem sempre o texto).
    let nomeSituacao = {};
    try {
      const r = await blingGet('https://api.bling.com.br/v3/situacoes/modulos', token);
      if (r.ok) {
        const mods = (await r.json())?.data || [];
        const vendas = mods.find((m) => /venda/i.test(m?.nome || ''));
        for (const s of vendas?.situacoes || []) nomeSituacao[s.id] = s.nome;
      }
    } catch (_) { /* segue sem nomes */ }
    const PADRAO = { 6: 'Em aberto', 9: 'Atendido', 12: 'Cancelado', 15: 'Em andamento', 18: 'Venda agenciada', 21: 'Em digitacao', 24: 'Anexado' };
    for (const [id, nome] of Object.entries(PADRAO)) if (!nomeSituacao[id]) nomeSituacao[id] = nome;

    const itens = [];
    let parcial = false;
    for (let pagina = 1; pagina <= 60; pagina++) {
      const url = `https://api.bling.com.br/v3/pedidos/vendas?dataInicial=${ini}&dataFinal=${fim}`
        + `&pagina=${pagina}&limite=100${idVendedor ? `&idVendedor=${idVendedor}` : ''}`;
      const r = await blingGet(url, token);
      if (!r.ok) { parcial = true; break; }
      const lista = (await r.json())?.data || [];
      if (!lista.length) break;
      for (const p of lista) {
        const sid = p.situacao?.id ?? 0;
        itens.push({
          numero: p.numero,
          data: p.data,
          cliente: p.contato?.nome || '',
          total: Number(p.total) || 0,
          situacaoId: sid,
          situacao: nomeSituacao[sid] || `situacao ${sid}`,
        });
      }
      if (lista.length < 100) break;
      await sleep(350);
    }

    itens.sort((a, b) => String(a.data).localeCompare(String(b.data)));
    const validos = itens.filter((i) => i.situacaoId !== CANCELADO);
    const totalValidos = validos.reduce((s, i) => s + i.total, 0);
    const brl = (n) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return res.status(200).json({
      ok: true,
      parcial,   // true = alguma pagina falhou; lista e piso, nao o total
      periodo: { ini, fim },
      vendedor: vendedorNome || 'TODOS',
      qtd: itens.length,
      qtd_validos: validos.length,
      total_validos: Math.round(totalValidos * 100) / 100,
      total_validos_fmt: brl(totalValidos),
      itens: itens.map((i) => ({ ...i, total_fmt: brl(i.total) })),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
