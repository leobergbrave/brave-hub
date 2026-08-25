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
const COLS = 'id, slug, cliente, bling_avista_id, bling_avista_numero, bling_avista_pdf, bling_prazo_id, bling_prazo_numero, bling_prazo_pdf, bling_pedido_id, bling_proposta_numero, proposta_pdf_path';

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
  return res.status(200).json({
    ok: true, slug: orc.slug, cliente: orc.cliente, tipo: tipoInfo.tipo, rotulo, bytes: pdf.length,
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
  const sufixo = { avista: ' (À vista)', prazo: ' (A prazo)', unica: '' }[t.tipo];
  const nomeArquivo = `Proposta ${orc[t.numCol] || ''} - ${nomeCliente}${sufixo}.pdf`.replace(/\s+/g, ' ');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nomeArquivo}"`);
  res.status(200).send(Buffer.from(await file.arrayBuffer()));
}
