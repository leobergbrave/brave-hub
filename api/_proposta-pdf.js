import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * Helpers de PDF da proposta, roteados por /api/bling (limite de funções do Hobby):
 *
 * uploadPdf — POST /api/bling?acao=proposta_pdf_upload
 * Recebe do userscript (rodando em bling.com.br/relatorios/orcamento.impressao.php)
 * o HTML oficial da proposta já renderizado na sessão logada, converte em PDF
 * (mesmo motor do "Salvar como PDF" do Chrome) e guarda no Storage vinculado
 * ao orçamento. A diretoria exige que o cliente receba o PDF do Bling — este
 * fluxo automatiza exatamente o documento que o Bling imprime.
 * Body: { numero, html }   Header: x-hub-token (env HUB_PDF_TOKEN)
 *
 * baixarPdf — GET /api/bling?acao=proposta_pdf&slug=...
 * Baixa o PDF guardado (bucket privado). O arquivo é o que o Léo anexa no
 * WhatsApp do cliente — cliente não recebe link.
 */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BUCKET = 'propostas-pdf';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getValidToken() {
  const { data: config } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
  if (!config) return null;
  const testRes = await fetch('https://api.bling.com.br/v3/contatos?limite=1', {
    headers: { Authorization: `Bearer ${config.access_token}`, Accept: '1.0' },
  });
  if (testRes.status !== 401) return config.access_token;
  const credentials = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: '1.0' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refresh_token }),
  });
  if (!response.ok) return null;
  const tokenData = await response.json();
  await supabaseAdmin.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return tokenData.access_token;
}

/* Cada orçamento pode ter até 3 propostas no Bling: à vista + a prazo (criadas
   automaticamente pela edge fn sync-bling-proposal ao salvar) e a "única" (botão
   Bling manual, via _bling-pedido.js). Cada uma tem seu par id/numero e seu PDF. */
const TIPOS = [
  { tipo: 'avista', idCol: 'bling_avista_id', numCol: 'bling_avista_numero', pdfCol: 'bling_avista_pdf' },
  { tipo: 'prazo', idCol: 'bling_prazo_id', numCol: 'bling_prazo_numero', pdfCol: 'bling_prazo_pdf' },
  { tipo: 'unica', idCol: 'bling_pedido_id', numCol: 'bling_proposta_numero', pdfCol: 'proposta_pdf_path' },
];
const COLS = 'id, slug, cliente, payload, origem_lead, proposta_pdf_enviado_em, bling_avista_id, bling_avista_numero, bling_avista_pdf, bling_prazo_id, bling_prazo_numero, bling_prazo_pdf, bling_pedido_id, bling_proposta_numero, proposta_pdf_path';

/* Propostas criadas antes de guardarmos o numero — resolve consultando a API do
   Bling pelos ids sem numero salvo, mais recentes primeiro, até achar a que
   bate. Cada consulta preenche a coluna, então o custo é pago uma vez só. */
async function backfillNumero(numeroProcurado) {
  const token = await getValidToken();
  if (!token) return null;
  // Limite baixo para caber com folga no maxDuration de 60s da função /api/bling
  // (proposta recém-impressa quase sempre está no topo — early exit no match).
  const { data: rows } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select(COLS)
    .or(TIPOS.map(t => `and(${t.idCol}.not.is.null,${t.numCol}.is.null)`).join(','))
    .order('criado_em', { ascending: false })
    .limit(12);
  for (const row of rows || []) {
    for (const t of TIPOS) {
      if (!row[t.idCol] || row[t.numCol]) continue;
      await sleep(350);
      const r = await fetch(`https://api.bling.com.br/v3/propostas-comerciais/${row[t.idCol]}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: '1.0' },
      });
      if (!r.ok) continue;
      const numero = (await r.json())?.data?.numero;
      if (!numero) continue;
      await supabaseAdmin.from('orcamentos_salvos').update({ [t.numCol]: numero }).eq('id', row.id);
      row[t.numCol] = numero;
      if (Number(numero) === Number(numeroProcurado)) return row;
    }
  }
  return null;
}

async function htmlParaPdf(html) {
  // Na Vercel usa o Chromium serverless; em dev local (Windows) usa o Chrome instalado.
  const local = process.platform === 'win32' || process.platform === 'darwin';
  const browser = await puppeteer.launch(
    local
      ? {
          executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          headless: true,
        }
      : { args: chromium.args, executablePath: await chromium.executablePath(), headless: true }
  );
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false); // documento é estático; imagens vêm inline como data URI
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
    });
  } finally {
    await browser.close();
  }
}

export async function uploadPdf(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const tokenEsperado = process.env.HUB_PDF_TOKEN;
  if (!tokenEsperado) {
    return res.status(500).json({ ok: false, error: 'HUB_PDF_TOKEN não configurado na Vercel.' });
  }
  if (req.headers['x-hub-token'] !== tokenEsperado) {
    return res.status(401).json({ ok: false, error: 'Token inválido.' });
  }

  const { numero, html } = req.body || {};
  const num = parseInt(numero, 10);
  if (!num || !html || typeof html !== 'string' || html.length < 200) {
    return res.status(400).json({ ok: false, error: 'numero e html são obrigatórios.' });
  }

  // 1. Achar o orçamento dono desta proposta (à vista, a prazo ou única)
  let { data: orc } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select(COLS)
    .or(TIPOS.map(t => `${t.numCol}.eq.${num}`).join(','))
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!orc) orc = await backfillNumero(num);
  if (!orc) {
    return res.status(200).json({
      ok: false,
      error: `Nenhum orçamento do HUB vinculado à proposta nº ${num}. Gere o orçamento pelo HUB primeiro (propostas criadas à mão no Bling não têm vínculo).`,
    });
  }
  const tipoInfo = TIPOS.find(t => Number(orc[t.numCol]) === num) || TIPOS[2];

  // 2. HTML → PDF (mesmo motor do "Salvar como PDF" do Chrome)
  let pdf;
  try {
    pdf = await htmlParaPdf(html);
  } catch (e) {
    console.error('[proposta-pdf] erro na conversão:', e);
    return res.status(500).json({ ok: false, error: `Falha ao converter em PDF: ${e.message}` });
  }

  // 3. Guardar no Storage (bucket privado; download só pelo HUB)
  const path = tipoInfo.tipo === 'unica' ? `${orc.slug}.pdf` : `${orc.slug}-${tipoInfo.tipo}.pdf`;
  let up = await supabaseAdmin.storage.from(BUCKET).upload(path, pdf, {
    contentType: 'application/pdf',
    upsert: true,
  });
  if (up.error && /bucket.*not.*found/i.test(up.error.message || '')) {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
    up = await supabaseAdmin.storage.from(BUCKET).upload(path, pdf, {
      contentType: 'application/pdf',
      upsert: true,
    });
  }
  if (up.error) {
    console.error('[proposta-pdf] erro no storage:', up.error);
    return res.status(500).json({ ok: false, error: `Falha ao salvar PDF: ${up.error.message}` });
  }

  await supabaseAdmin.from('orcamentos_salvos').update({
    [tipoInfo.pdfCol]: path,
    proposta_pdf_em: new Date().toISOString(),
  }).eq('id', orc.id);

  const rotulo = { avista: 'à vista', prazo: 'a prazo', unica: '' }[tipoInfo.tipo];
  console.log('[proposta-pdf] salvo:', { numero: num, tipo: tipoInfo.tipo, slug: orc.slug, bytes: pdf.length });

  // Envio automático (lead FSS): dispara sozinho quando o ÚLTIMO PDF esperado
  // fica pronto — assim o cliente recebe as duas condições de uma vez, e não
  // uma proposta solta. Só vale para FSS; nos outros canais o Léo usa o botão.
  orc[tipoInfo.pdfCol] = path;
  let envioAuto;
  if (String(orc.origem_lead || '').toUpperCase() === 'FSS' && !orc.proposta_pdf_enviado_em) {
    const esperados = TIPOS.filter(t => orc[t.idCol]);
    const prontos = esperados.filter(t => orc[t.pdfCol]);
    if (esperados.length > 0 && prontos.length === esperados.length) {
      envioAuto = await despacharPdfs(orc);
      console.log('[proposta-pdf] envio automático FSS:', envioAuto);
    }
  }

  return res.status(200).json({
    ok: true, slug: orc.slug, cliente: orc.cliente, tipo: tipoInfo.tipo, rotulo, bytes: pdf.length,
    envioAuto: envioAuto ? (envioAuto.ok ? 'enviado' : `falhou: ${envioAuto.error}`) : undefined,
  });
}

/* enviarPdfCliente — POST /api/bling?acao=enviar_pdf_cliente  body: { slug }
 *
 * Manda os PDFs oficiais direto no WhatsApp do cliente pela API do BotConversa
 * (POST /subscriber/{id}/send_message com type:"file" aceita URL dinâmica).
 * As URLs são assinadas e temporárias — o bucket continua privado, e o cliente
 * recebe o ARQUIVO no WhatsApp, nunca um link (exigência da diretoria).
 *
 * Limite da Meta: fora da janela de 24h desde a última mensagem do cliente, só
 * template aprovado passa. O erro do BotConversa é repassado ao HUB nesse caso.
 */
const BC_BASE = 'https://backend.botconversa.com.br/api/v1/webhook';

async function bcFetch(path, method, body, apiKey) {
  const r = await fetch(`${BC_BASE}${path}`, {
    method,
    headers: { 'API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch (_) {}
  return { ok: r.ok, status: r.status, json, texto };
}

/* Faz o envio de fato. Usado pelo botão do HUB e pelo disparo automático que
   roda quando o último PDF de um orçamento FSS fica pronto. */
async function despacharPdfs(orc) {
  const apiKey = process.env.BOTCONVERSA_API_KEY;
  if (!apiKey) {
    return { ok: false, error: 'BOTCONVERSA_API_KEY não configurada na Vercel. Pegue em Configurações da companhia → Integrações → chave "Webhook Integration".' };
  }

  const disponiveis = TIPOS.filter(t => orc[t.pdfCol]);
  if (disponiveis.length === 0) {
    return { ok: false, error: 'Nenhum PDF capturado ainda. Imprima a proposta no Bling primeiro.' };
  }

  let tel = String(orc.payload?.telefoneCliente || '').replace(/\D/g, '');
  if (tel.length === 10 || tel.length === 11) tel = `55${tel}`;
  if (tel.length < 12) {
    return { ok: false, error: 'Orçamento sem telefone válido do cliente.' };
  }

  /* O WhatsApp usa a URL como nome do arquivo. A URL assinada do Supabase traz
     "?token=eyJ..." grudado no fim, então o cliente recebia
     "…-avista.pdf?token=eyJraWQi…" — nome ilegível E arquivo que não abre,
     porque a extensão deixa de ser .pdf. Por isso servimos por uma rota nossa
     que TERMINA no nome do arquivo (ver a rota /pdf/ no vercel.json). */
  const base = process.env.HUB_BASE_URL || 'https://brave-hub-two.vercel.app';
  const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const arquivos = disponiveis.map((t) => {
    const sufixo = { avista: ' - A vista', prazo: ' - A prazo', unica: '' }[t.tipo];
    const nome = semAcento(`Proposta ${orc[t.numCol] || ''} - ${orc.cliente || 'Cliente'}${sufixo}.pdf`)
      .replace(/[^A-Za-z0-9 .-]/g, '').replace(/\s+/g, ' ').trim();
    return { tipo: t.tipo, url: `${base}/pdf/${orc.slug}/${t.tipo}/${encodeURIComponent(nome)}` };
  });

  // Contato no BotConversa (busca por telefone; cria se não existir)
  let subscriberId = null;
  const busca = await bcFetch(`/subscriber/get_by_phone/+${tel}/`, 'GET', null, apiKey);
  if (busca.ok) subscriberId = busca.json?.id ?? null;
  if (!subscriberId) {
    const partes = String(orc.cliente || 'Cliente').trim().split(/\s+/);
    const criado = await bcFetch('/subscriber/', 'POST', {
      phone: `+${tel}`,
      first_name: partes[0] || 'Cliente',
      last_name: partes.slice(1).join(' ') || 'BRAVE',
    }, apiKey);
    subscriberId = criado.json?.id ?? null;
    if (!subscriberId) {
      return { ok: false, error: `Falha ao criar contato no BotConversa: ${criado.texto.slice(0, 200)}` };
    }
  }

  const enviar = (body) => bcFetch(`/subscriber/${subscriberId}/send_message/`, 'POST', body, apiKey);

  const primeiroNome = String(orc.cliente || 'Cliente').trim().split(/\s+/)[0];
  const saudacao = await enviar({
    type: 'text',
    value: `Olá, ${primeiroNome}! Aqui é da BRAVE Fitness 🦁\nSegue sua proposta comercial em PDF. Qualquer dúvida, é só chamar!`,
  });
  if (!saudacao.ok) {
    return { ok: false, error: `BotConversa recusou o envio (HTTP ${saudacao.status}): ${saudacao.texto.slice(0, 250)}` };
  }

  const enviados = [];
  const falhas = [];
  for (const a of arquivos) {
    const r = await enviar({ type: 'file', value: a.url });
    (r.ok ? enviados : falhas).push(a.tipo);
    await sleep(600);
  }

  if (enviados.length > 0) {
    await supabaseAdmin.from('orcamentos_salvos')
      .update({ proposta_pdf_enviado_em: new Date().toISOString() })
      .eq('id', orc.id);
  }

  console.log('[proposta-pdf] envio BotConversa:', { slug: orc.slug, tel, enviados, falhas });
  return {
    ok: falhas.length === 0,
    enviados,
    falhas,
    error: falhas.length ? `Falha ao enviar: ${falhas.join(', ')}` : undefined,
  };
}

export async function enviarPdfCliente(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const { slug } = req.body || {};
  if (!slug) return res.status(400).json({ ok: false, error: 'slug é obrigatório.' });

  const { data: orc } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select(COLS)
    .eq('slug', slug)
    .maybeSingle();
  if (!orc) return res.status(404).json({ ok: false, error: 'Orçamento não encontrado.' });

  return res.status(200).json(await despacharPdfs(orc));
}

/* GET /api/bling?acao=proposta_por_telefone&telefone=...
   Usado pelo botão injetado na tela do contato no FSS: diz se aquele contato
   tem proposta com PDF pronto para enviar. */
export async function propostaPorTelefone(req, res) {
  const tel = String(req.query?.telefone || '').replace(/\D/g, '').replace(/^55/, '');
  if (tel.length < 10) return res.status(400).json({ ok: false, error: 'telefone inválido' });

  // O telefone do cliente vive dentro do payload do orçamento — compara pelos
  // 8 últimos dígitos porque o nono dígito e o DDI entram e saem conforme a origem.
  const fim = tel.slice(-8);
  const { data: linhas } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select(COLS)
    .or(TIPOS.map(t => `${t.pdfCol}.not.is.null`).join(','))
    .order('criado_em', { ascending: false })
    .limit(60);

  const achado = (linhas || []).find(o =>
    String(o.payload?.telefoneCliente || '').replace(/\D/g, '').endsWith(fim));

  if (!achado) return res.status(200).json({ ok: true, encontrado: false });

  return res.status(200).json({
    ok: true,
    encontrado: true,
    slug: achado.slug,
    cliente: achado.cliente,
    enviadoEm: achado.proposta_pdf_enviado_em || null,
    pdfs: TIPOS.filter(t => achado[t.pdfCol]).map(t => t.tipo),
  });
}

export async function baixarPdf(req, res) {
  const { slug, tipo } = req.query || {};
  if (!slug) return res.status(400).json({ ok: false, error: 'slug é obrigatório.' });

  const { data: orc } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select(COLS)
    .eq('slug', slug)
    .maybeSingle();
  // tipo explícito, senão o primeiro que tiver PDF (avista → prazo → unica)
  const t = TIPOS.find(x => x.tipo === tipo) || TIPOS.find(x => orc?.[x.pdfCol]);
  if (!orc || !t || !orc[t.pdfCol]) {
    return res.status(404).json({ ok: false, error: 'PDF ainda não gerado para este orçamento.' });
  }

  const { data: file, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .download(orc[t.pdfCol]);
  if (error || !file) {
    return res.status(500).json({ ok: false, error: `Falha ao ler PDF: ${error?.message || 'vazio'}` });
  }

  const nomeCliente = (orc.cliente || 'Cliente').replace(/[^\p{L}\p{N} .-]/gu, '').trim();
  const sufixo = { avista: ' (A vista)', prazo: ' (A prazo)', unica: '' }[t.tipo];
  const nomeArquivo = `Proposta ${orc[t.numCol] || ''} - ${nomeCliente}${sufixo}.pdf`.replace(/\s+/g, ' ');
  // Header HTTP e ASCII: acento cru vira "%EF%BF%BD" no nome baixado. O filename
  // simples leva a versao sem acento e o filename* (RFC 5987) o nome correto.
  const nomeAscii = nomeArquivo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`
  );
  res.status(200).send(Buffer.from(await file.arrayBuffer()));
}
