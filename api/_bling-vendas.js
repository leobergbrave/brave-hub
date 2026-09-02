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

/* O Bling limita ~3 req/s e o robo tambem consome a API — 429 e comum. Aqui
   esperamos e tentamos de novo ate 4 vezes antes de desistir, para a soma nao
   sair truncada (uma pagina que falha silenciosamente subestima o total). */
async function blingGet(url, token, tentativas = 4) {
  for (let i = 1; i <= tentativas; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: '1.0' } });
    if (r.status !== 429) return r;
    await sleep(1500 * i);
  }
  return fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: '1.0' } });
}

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

/* sincronizarVendas — POST /api/bling?acao=sincronizar_vendas

   Detecta sozinho quando um orcamento virou venda: casa os pedidos de venda
   do Bling (ultimos 40 dias) com os orcamentos Pendentes (ultimos 120 dias)
   por CPF/CNPJ ou nome normalizado do cliente, e marca payload.status =
   'Aprovado' — o que tira o cliente do Follow Up LEADS automaticamente.

   Chamada pelo admin ao abrir a fila de follow-up, sem token: nao expoe dado
   nenhum, e uma trava de ritmo (10 min, estado no bucket privado) impede
   marteladas na API do Bling. So considera venda pedido nao-cancelado e
   criado DEPOIS do orcamento (venda antiga nao aprova orcamento novo). */
const ESTADO_SYNC = 'estado/sync-vendas.json';
const BUCKET_SYNC = 'propostas-pdf';

const normNome = (s) => String(s || '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\s*\(copia\)\s*$/, '').replace(/\s+/g, ' ').trim();

export async function executarSyncVendas() {
  try {
    const agora = Date.now();
    try {
      const dl = await supabaseAdmin.storage.from(BUCKET_SYNC).download(ESTADO_SYNC);
      if (!dl.error) {
        const st = JSON.parse(await dl.data.text());
        if (agora - (st.em || 0) < 10 * 60 * 1000) {
          return { ok: true, pulado: true, ultimaEm: st.em, aprovados: st.aprovados || [] };
        }
      }
    } catch (_) { /* sem estado: primeira execucao */ }
    const salvarEstado = (aprovados) => supabaseAdmin.storage.from(BUCKET_SYNC)
      .upload(ESTADO_SYNC, Buffer.from(JSON.stringify({ em: agora, aprovados })), {
        upsert: true, contentType: 'application/json',
      });

    const corte = new Date(agora - 120 * 24 * 3600 * 1000).toISOString();
    const { data: linhas } = await supabaseAdmin
      .from('orcamentos_salvos')
      .select('id, slug, cliente, criado_em, payload, bling_pedido_id')
      .gte('criado_em', corte)
      .order('criado_em', { ascending: false })
      .limit(400);
    const pendentes = (linhas || []).filter((o) => (o.payload?.status || 'Pendente') === 'Pendente');
    if (!pendentes.length) {
      await salvarEstado([]);
      return { ok: true, aprovados: [], verificados: 0 };
    }

    const token = await getValidToken();
    if (!token) return { ok: false, error: 'Sem token Bling.' };

    const iso = (d) => d.toISOString().slice(0, 10);
    const ini = iso(new Date(agora - 40 * 24 * 3600 * 1000));
    const fim = iso(new Date(agora));
    const porDoc = new Map();   // cpf/cnpj (digitos) -> pedido
    const porNome = new Map();  // nome normalizado -> pedido
    for (let pagina = 1; pagina <= 30; pagina++) {
      const r = await blingGet(`https://api.bling.com.br/v3/pedidos/vendas?dataInicial=${ini}&dataFinal=${fim}&pagina=${pagina}&limite=100`, token);
      if (!r.ok) break; // sync e melhor-esforco: tenta de novo na proxima chamada
      const lista = (await r.json())?.data || [];
      if (!lista.length) break;
      for (const p of lista) {
        if ((p.situacao?.id ?? 0) === 12) continue; // cancelado nao e venda
        const doc = String(p.contato?.numeroDocumento || '').replace(/\D/g, '');
        if (doc.length >= 11 && !porDoc.has(doc)) porDoc.set(doc, p);
        const nome = normNome(p.contato?.nome);
        if (nome.length >= 5 && !porNome.has(nome)) porNome.set(nome, p);
      }
      if (lista.length < 100) break;
      await sleep(350);
    }

    const aprovados = [];
    for (const o of pendentes) {
      const doc = String(o.payload?.cpfCnpj || '').replace(/\D/g, '');
      const pedido = (doc.length >= 11 && porDoc.get(doc)) || porNome.get(normNome(o.cliente));
      if (!pedido) continue;
      if (String(pedido.data || '') < String(o.criado_em).slice(0, 10)) continue; // venda anterior ao orcamento
      const payload = { ...(o.payload || {}), status: 'Aprovado',
        aprovado_auto: { pedidoId: pedido.id, numero: pedido.numero, data: pedido.data, em: new Date(agora).toISOString() } };
      const upd = { payload };
      if (!o.bling_pedido_id) upd.bling_pedido_id = pedido.id;
      const { error } = await supabaseAdmin.from('orcamentos_salvos').update(upd).eq('id', o.id);
      if (!error) aprovados.push({ slug: o.slug, cliente: o.cliente, pedido: pedido.numero });
    }

    await salvarEstado(aprovados);
    console.log('[sync-vendas]', { verificados: pendentes.length, pedidos: porNome.size, aprovados: aprovados.length });
    return { ok: true, aprovados, verificados: pendentes.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export async function sincronizarVendas(req, res) {
  const r = await executarSyncVendas();
  return res.status(r.ok ? 200 : 500).json(r);
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

  // Filtro opcional por vendedor: "37 ganhas" costuma ser de UM consultor, e o
  // Bling sem filtro traz a empresa inteira. Resolve o id pelo nome (sem acento).
  const semAcento = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  let idVendedor = null; let vendedorNome = null;
  const alvoVend = semAcento(req.query?.vendedor || '');
  if (alvoVend) {
    const rv = await blingGet('https://api.bling.com.br/v3/vendedores', token);
    if (rv.ok) {
      const lista = ((await rv.json())?.data || []).filter((v) => (v?.contato?.nome || '').trim());
      let m = lista.find((v) => semAcento(v.contato.nome) === alvoVend)
        || lista.find((v) => semAcento(v.contato.nome).includes(alvoVend));
      if (m) { idVendedor = m.id; vendedorNome = m.contato.nome; }
    }
    if (!idVendedor) return res.status(200).json({ ok: false, error: `Vendedor "${req.query.vendedor}" nao encontrado no Bling.` });
    await sleep(400);
  }

  // Nomes de situacao pelo id (o pedido traz situacao.id, nem sempre o texto)
  let nomeSituacao = {};
  try {
    const r = await blingGet('https://api.bling.com.br/v3/situacoes/modulos', token);
    if (r.ok) {
      const mods = (await r.json())?.data || [];
      const vendas = mods.find((m) => /venda/i.test(m?.nome || ''));
      for (const s of vendas?.situacoes || []) nomeSituacao[s.id] = s.nome;
    }
  } catch (_) { /* segue sem nomes */ }
  // Fallback: nomes padrao do modulo de vendas do Bling, caso a consulta acima
  // tenha falhado por rate limit.
  const PADRAO = { 6: 'Em aberto', 9: 'Atendido', 12: 'Cancelado', 15: 'Em andamento', 18: 'Venda agenciada', 21: 'Em digitacao', 24: 'Anexado' };
  for (const [id, nome] of Object.entries(PADRAO)) if (!nomeSituacao[id]) nomeSituacao[id] = nome;

  const porSituacao = {};
  let total = 0;
  let qtd = 0;
  let pagina = 1;
  const MAX_PAG = 60;
  for (; pagina <= MAX_PAG; pagina++) {
    const url = `https://api.bling.com.br/v3/pedidos/vendas?dataInicial=${ini}&dataFinal=${fim}&pagina=${pagina}&limite=100${idVendedor ? `&idVendedor=${idVendedor}` : ''}`;
    const r = await blingGet(url, token);
    if (!r.ok) {
      // Falha em QUALQUER pagina interrompe com aviso — nao devolvemos soma
      // parcial mascarada de total.
      return res.status(200).json({ ok: false, parcial: true, lidoAte: pagina - 1,
        error: `Bling HTTP ${r.status} na pagina ${pagina}: ${(await r.text()).slice(0, 150)}` });
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
    ok: true, periodo: { ini, fim }, vendedor: vendedorNome || 'TODOS',
    total_geral: total, total_geral_fmt: brl(total), qtd_geral: qtd,
    por_situacao: quebra,
    paginas_lidas: pagina,
  });
}
