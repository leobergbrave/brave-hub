// api/_analise-vendedores.js — comparativo de desempenho entre os vendedores,
// direto dos pedidos de venda do Bling.
//
// Por que aqui e nao no navegador: os numeros exigem o token do ERP, que vive
// em bling_config — tabela trancada para a chave publica em 08/09/2026. Só o
// servidor (service role) alcanca.
//
// GET /api/bling?acao=analise_vendedores&ini=YYYY-MM-DD&fim=YYYY-MM-DD
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

/* 429 e comum (o robo de PDF divide a mesma cota). Esperar e tentar de novo,
   em vez de desistir: uma pagina perdida em silencio faria o vendedor aparecer
   com menos vendas do que realmente tem — pior que erro nenhum. */
async function blingGet(url, token, tentativas = 4) {
  for (let i = 1; i <= tentativas; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: '1.0' } });
    if (r.status === 429) { await sleep(1200 * i); continue; }
    return r;
  }
  return { ok: false, status: 429 };
}

const CANCELADO = 12;   // situacao que nao conta como venda

/* Pedidos de um vendedor no periodo. Devolve tambem `parcial` quando a
   paginacao foi interrompida — numero truncado precisa se anunciar. */
async function pedidosDoVendedor(idVendedor, ini, fim, token) {
  const pedidos = [];
  let parcial = false;
  for (let pagina = 1; pagina <= 40; pagina++) {
    const url = `https://api.bling.com.br/v3/pedidos/vendas?dataInicial=${ini}&dataFinal=${fim}`
      + `&pagina=${pagina}&limite=100&idVendedor=${idVendedor}`;
    const r = await blingGet(url, token);
    if (!r.ok) { parcial = true; break; }
    const lista = (await r.json())?.data || [];
    pedidos.push(...lista);
    if (lista.length < 100) break;
    await sleep(350);
  }
  return { pedidos, parcial };
}

const mesDe = (data) => String(data || '').slice(0, 7);

function resumir(pedidos) {
  const validos = pedidos.filter((p) => (p.situacao?.id ?? 0) !== CANCELADO);
  const total = validos.reduce((s, p) => s + (Number(p.total) || 0), 0);
  const porMes = {};
  for (const p of validos) {
    const m = mesDe(p.data);
    if (!porMes[m]) porMes[m] = { qtd: 0, total: 0 };
    porMes[m].qtd += 1;
    porMes[m].total += Number(p.total) || 0;
  }
  const valores = validos.map((p) => Number(p.total) || 0).sort((a, b) => a - b);
  return {
    pedidos: validos.length,
    cancelados: pedidos.length - validos.length,
    faturamento: Math.round(total * 100) / 100,
    ticketMedio: validos.length ? Math.round((total / validos.length) * 100) / 100 : 0,
    // Mediana ao lado da media: uma venda gigante distorce a media e faz o
    // vendedor parecer melhor do que o dia a dia mostra.
    ticketMediano: valores.length ? valores[Math.floor(valores.length / 2)] : 0,
    maiorVenda: valores.length ? valores[valores.length - 1] : 0,
    porMes,
  };
}

export async function analiseVendedores(req, res) {
  try {
    const hoje = new Date().toISOString().slice(0, 10);
    const ini = String(req.query?.ini || '2026-05-01').slice(0, 10);
    const fim = String(req.query?.fim || hoje).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
      return res.status(400).json({ ok: false, error: 'use ini e fim no formato YYYY-MM-DD.' });
    }

    const token = await getValidToken();
    if (!token) return res.status(500).json({ ok: false, error: 'Sem token do Bling.' });

    const rv = await blingGet('https://api.bling.com.br/v3/vendedores', token);
    if (!rv.ok) return res.status(502).json({ ok: false, error: `Bling recusou a lista de vendedores (HTTP ${rv.status}).` });
    const vendedores = ((await rv.json())?.data || [])
      .filter((v) => (v?.contato?.nome || '').trim())
      .map((v) => ({ id: v.id, nome: v.contato.nome }));

    const resultado = [];
    let algumParcial = false;
    for (const v of vendedores) {
      await sleep(350);
      const { pedidos, parcial } = await pedidosDoVendedor(v.id, ini, fim, token);
      if (parcial) algumParcial = true;
      resultado.push({ ...v, ...resumir(pedidos) });
    }

    resultado.sort((a, b) => b.faturamento - a.faturamento);
    const totalGeral = resultado.reduce((s, v) => s + v.faturamento, 0);
    const pedidosGeral = resultado.reduce((s, v) => s + v.pedidos, 0);

    return res.status(200).json({
      ok: true,
      periodo: { ini, fim },
      parcial: algumParcial,   // true = alguma pagina falhou; numeros sao piso, nao total
      totalGeral: Math.round(totalGeral * 100) / 100,
      pedidosGeral,
      vendedores: resultado.map((v) => ({
        ...v,
        participacao: totalGeral > 0 ? Math.round((v.faturamento / totalGeral) * 1000) / 10 : 0,
      })),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
