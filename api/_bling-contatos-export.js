import { createClient } from '@supabase/supabase-js';

/* Exporta a base de CONTATOS do Bling para o motor Always Profit (@leo.berg_).
   Autorizado pelo Léo em 02/09/2026: quem compra equipamento na Brave (box,
   academia, studio) é o mesmo público que organiza prova híbrida.

   GET /api/bling?acao=exportar_contatos&pagina=N          → uma página da lista (100 por vez)
   GET /api/bling?acao=exportar_contatos&ids=1,2,3         → detalhe de até 60 contatos (e-mail, cidade, UF)
   Header: x-hub-token (env HUB_PDF_TOKEN — o mesmo dos userscripts)

   Uma página por chamada, de propósito: a função tem 60 s e o Bling limita
   ~3 req/s. Quem pagina é o motor, que dorme entre as chamadas. A lista do
   Bling não traz e-mail nem endereço; por isso o modo `ids`, que o motor usa
   aos poucos para completar o cadastro. */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BLING = 'https://api.bling.com.br/v3';

async function getValidToken() {
  const { data: config } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
  if (!config) return null;
  const teste = await fetch(`${BLING}/contatos?limite=1`, {
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

/* 429 é rotina no Bling (o robô e o painel também consomem a API): espera e
   tenta de novo até 4 vezes antes de devolver o erro. */
async function blingGet(path, token, tentativas = 4) {
  let r;
  for (let i = 1; i <= tentativas; i++) {
    r = await fetch(`${BLING}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: '1.0' } });
    if (r.status !== 429) return r;
    await sleep(1200 * i);
  }
  return r;
}

/* Achata o contato do Bling (lista ou detalhe) no formato que o motor guarda.
   Campos que só existem no detalhe (email, endereço, tipo) ficam null na lista. */
export function mapearContato(c) {
  const doc = String(c.numeroDocumento || '').replace(/\D/g, '');
  const end = c.endereco?.geral || c.endereco || {};
  const tipo = c.tipo || (doc.length === 14 ? 'J' : doc.length === 11 ? 'F' : null);
  return {
    id: c.id,
    nome: c.nome || null,
    fantasia: c.fantasia || c.nomeFantasia || null,
    tipo,
    documento: doc || null,
    email: c.email || null,
    telefone: c.celular || c.telefone || null,
    telefone2: c.celular && c.telefone && c.celular !== c.telefone ? c.telefone : null,
    cidade: end.municipio || null,
    uf: end.uf || null,
    situacao: c.situacao || null,
    detalhado: Boolean(c.endereco || c.email || c.tipo),
  };
}

export default async function exportarContatos(req, res) {
  if (req.headers['x-hub-token'] !== process.env.HUB_PDF_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Não autorizado.' });
  }
  const token = await getValidToken();
  if (!token) return res.status(500).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });

  const ids = String(req.query?.ids || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 60);
  if (ids.length) {
    const contatos = [];
    const falhas = [];
    for (const id of ids) {
      const r = await blingGet(`/contatos/${id}`, token);
      if (r.ok) contatos.push(mapearContato((await r.json())?.data || { id }));
      else falhas.push({ id, status: r.status });
      await sleep(260);
    }
    return res.status(200).json({ ok: true, modo: 'detalhe', contatos, falhas });
  }

  const pagina = Math.max(1, Number(req.query?.pagina || 1));
  const r = await blingGet(`/contatos?pagina=${pagina}&limite=100`, token);
  if (!r.ok) return res.status(502).json({ ok: false, error: `Bling respondeu ${r.status}`, pagina });
  const lista = (await r.json())?.data || [];
  return res.status(200).json({
    ok: true, modo: 'lista', pagina,
    contatos: lista.map(mapearContato),
    tem_mais: lista.length === 100,
    campos: lista[0] ? Object.keys(lista[0]) : [],   // diagnóstico: o que a lista do Bling realmente traz
  });
}
