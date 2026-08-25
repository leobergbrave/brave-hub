import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

/**
 * POST /api/proposta-pdf-upload
 * Recebe do userscript (rodando em bling.com.br/relatorios/orcamento.impressao.php)
 * o HTML oficial da proposta já renderizado na sessão logada, converte em PDF
 * (mesmo motor do "Salvar como PDF" do Chrome) e guarda no Storage vinculado
 * ao orçamento. A diretoria exige que o cliente receba o PDF do Bling — este
 * fluxo automatiza exatamente o documento que o Bling imprime.
 *
 * Body: { numero, html }   Header: x-hub-token (env HUB_PDF_TOKEN)
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

/* Propostas antigas foram criadas antes de guardarmos o numero — resolve
   consultando a API do Bling pelas propostas sem numero salvo, mais recentes
   primeiro, até achar a que bate. Cada consulta preenche a coluna, então o
   custo é pago uma vez só por proposta. */
async function backfillNumero(numeroProcurado) {
  const token = await getValidToken();
  if (!token) return null;
  const { data: rows } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select('id, slug, bling_pedido_id')
    .not('bling_pedido_id', 'is', null)
    .is('bling_proposta_numero', null)
    .order('criado_em', { ascending: false })
    .limit(40);
  for (const row of rows || []) {
    await sleep(350);
    const r = await fetch(`https://api.bling.com.br/v3/propostas-comerciais/${row.bling_pedido_id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: '1.0' },
    });
    if (!r.ok) continue;
    const numero = (await r.json())?.data?.numero;
    if (!numero) continue;
    await supabaseAdmin.from('orcamentos_salvos').update({ bling_proposta_numero: numero }).eq('id', row.id);
    if (Number(numero) === Number(numeroProcurado)) return row;
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-hub-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
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

  // 1. Achar o orçamento dono desta proposta
  let { data: orc } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select('id, slug, cliente')
    .eq('bling_proposta_numero', num)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!orc) orc = await backfillNumero(num);
  if (!orc) {
    return res.status(200).json({
      ok: false,
      error: `Nenhum orçamento do HUB vinculado à proposta nº ${num}. Envie o orçamento ao Bling pelo HUB primeiro.`,
    });
  }

  // 2. HTML → PDF (mesmo motor do "Salvar como PDF" do Chrome)
  let pdf;
  try {
    pdf = await htmlParaPdf(html);
  } catch (e) {
    console.error('[proposta-pdf] erro na conversão:', e);
    return res.status(500).json({ ok: false, error: `Falha ao converter em PDF: ${e.message}` });
  }

  // 3. Guardar no Storage (bucket privado; download só pelo HUB)
  const path = `${orc.slug}.pdf`;
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
    proposta_pdf_path: path,
    proposta_pdf_em: new Date().toISOString(),
  }).eq('id', orc.id);

  console.log('[proposta-pdf] salvo:', { numero: num, slug: orc.slug, bytes: pdf.length });
  return res.status(200).json({ ok: true, slug: orc.slug, cliente: orc.cliente, bytes: pdf.length });
}
