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
const COLS = 'id, slug, cliente, consultor, payload, origem_lead, criado_em, propostas_em, proposta_pdf_enviado_em, bling_avista_id, bling_avista_numero, bling_avista_pdf, bling_prazo_id, bling_prazo_numero, bling_prazo_pdf, bling_pedido_id, bling_proposta_numero, proposta_pdf_path';

/* Nome e URL do PDF para entrega ao cliente. O caminho leva um carimbo de
   versao (/v<epoch>/) porque WhatsApp, BotConversa e o chat do FSS cacheiam
   midia POR URL: reenviar uma proposta recapturada na mesma URL devolvia o
   arquivo antigo do cache, sem consultar o servidor. */
const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
function linkPdf(orc, t, versao) {
  const base = process.env.HUB_BASE_URL || 'https://brave-hub-two.vercel.app';
  const sufixo = { avista: ' - A vista', prazo: ' - A prazo', unica: '' }[t.tipo];
  // Sem espaco nem acento no nome: a URL vai para o WhatsApp/BotConversa, e
  // %20 no caminho ja quebrou o download em intermediario. Hifen sempre passa.
  const nome = semAcento(`Proposta ${orc[t.numCol] || ''} - ${orc.cliente || 'Cliente'}${sufixo}`)
    .replace(/[^A-Za-z0-9 .-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 80) + '.pdf';
  const v = versao || Date.now();
  return { tipo: t.tipo, nome, url: `${base}/pdf/${orc.slug}/${t.tipo}/v${v}/${encodeURIComponent(nome)}` };
}

/* Canais em que o cliente recebe as propostas sozinho, assim que os dois PDFs
   ficam prontos. Nos demais (Uairox, Indicação, Personalizado) o envio continua
   sendo decisão do consultor, pelo botão "Enviar ao cliente".
   TIAGO é o nome antigo do canal WhatsApp BRAVE — segue aqui para os orçamentos
   criados antes da renomeação continuarem funcionando. */
const ORIGENS_AUTOMATICAS = ['FSS', 'WHATSAPP', 'VENDA DIRETA', 'TIAGO'];

/* "SOMENTE BLING": o orcamento vira proposta no Bling e para por ai — o
   consultor imprime e guarda o PDF por conta propria. Fica de fora da fila do
   robo (capturar seria trabalho inutil) e, por nao estar em
   ORIGENS_AUTOMATICAS, nada e enviado ao cliente. */
const ORIGENS_SEM_CAPTURA = ['SOMENTE BLING'];

const brl = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* Resumo em texto dos valores, para o cliente ter os números na conversa sem
   precisar abrir o PDF. Repete a mesma conta da edge fn sync-bling-proposal
   (preço do item, senão preço de tabela com o desconto da condição) para que o
   texto e o documento do Bling nunca divirjam. */
function calcularTotais(orc) {
  const p = orc.payload || {};
  const itens = p.itens || [];
  const frete = Number(p.frete) || 0;
  const descAvista = Number(p.condicoes?.descontoAvista) || 0;
  const descPrazo = Number(p.condicoes?.descontoCartao) || 0;
  const parcelas = Number(p.condicoes?.parcelas) || 10;

  const soma = (campo, descPct) => itens.reduce((acc, i) => {
    const tabela = Number(i.preco) || 0;
    const unit = i[campo] != null ? Number(i[campo]) : tabela * (1 - descPct / 100);
    return acc + unit * (Number(i.quantidade) || 0);
  }, 0);

  const totalAvista = soma('preco_avista', descAvista) + frete;
  const totalPrazo = soma('preco_prazo', descPrazo) + frete;
  return {
    temItens: itens.length > 0,
    parcelas,
    totalAvista,
    totalPrazo,
    valorParcela: parcelas > 0 ? totalPrazo / parcelas : totalPrazo,
  };
}

/* Mensagem de UM anexo. No FSS cada PDF vai numa mensagem separada, entao
   repetir o resumo completo em cada uma fazia o cliente ler os mesmos dois
   valores duas vezes. Aqui cada arquivo leva so a condicao que ele representa. */
function mensagemDoTipo(orc, tipo) {
  const t = calcularTotais(orc);
  if (!t.temItens) return '✅ Segue sua proposta em anexo!';
  if (tipo === 'avista') {
    return `💰 *PROPOSTA À VISTA: ${brl(t.totalAvista)}*
(melhor desconto, frete já incluso)`;
  }
  if (tipo === 'prazo') {
    return `💳 *PROPOSTA A PRAZO: ${brl(t.totalPrazo)}*
em até ${t.parcelas}x de ${brl(t.valorParcela)}`;
  }
  return `✅ *Sua proposta: ${brl(t.totalAvista)}*
(frete já incluso)`;
}

function montarResumo(orc, temDuas) {
  const itens = orc.payload?.itens || [];
  const { parcelas, totalAvista, totalPrazo, valorParcela } = calcularTotais(orc);

  if (!itens.length) {
    return '✅ Sua proposta está pronta! Qualquer dúvida é só me chamar por aqui!';
  }
  if (!temDuas) {
    return `✅ Sua proposta está pronta!\n\nValor total: *${brl(totalAvista)}* (frete incluso)\n\nQualquer dúvida é só me chamar por aqui!`;
  }
  return [
    '✅ Sua proposta está pronta! Enviei as duas condições:',
    '',
    `💰 *À VISTA: ${brl(totalAvista)}*`,
    '(melhor desconto, frete já incluso)',
    '',
    `💳 *A PRAZO: ${brl(totalPrazo)}*`,
    `em até ${parcelas}x de ${brl(valorParcela)}`,
    '',
    'Qualquer dúvida é só me chamar por aqui!',
  ].join('\n');
}

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

/* Upload direto ao Storage por URL assinada — para o robo do Railway, cujo PDF
   e grande demais para caber no corpo da requisicao da Vercel (limite ~4,5MB no
   Hobby: "Request Entity Too Large"). Tres passos: pedir a vaga (slot), subir os
   bytes direto no Supabase, e finalizar (grava a coluna + dispara o envio). */
async function resolverOrc(num) {
  let { data: orc } = await supabaseAdmin.from('orcamentos_salvos').select(COLS)
    .or(TIPOS.map((t) => `${t.numCol}.eq.${num}`).join(','))
    .order('criado_em', { ascending: false }).limit(1).maybeSingle();
  if (!orc) orc = await backfillNumero(num);
  if (!orc) return null;
  const tipoInfo = TIPOS.find((t) => Number(orc[t.numCol]) === num) || TIPOS[2];
  const path = tipoInfo.tipo === 'unica' ? `${orc.slug}.pdf` : `${orc.slug}-${tipoInfo.tipo}.pdf`;
  return { orc, tipoInfo, path };
}

async function finalizarNoOrc(orc, tipoInfo, path) {
  await supabaseAdmin.from('orcamentos_salvos').update({
    [tipoInfo.pdfCol]: path, proposta_pdf_em: new Date().toISOString(),
  }).eq('id', orc.id);
  orc[tipoInfo.pdfCol] = path;
  const rotulo = { avista: 'à vista', prazo: 'a prazo', unica: '' }[tipoInfo.tipo];
  let envioAuto;
  const enviadoEm = orc.proposta_pdf_enviado_em;
  const propostasMaisNovas = !!(orc.propostas_em && enviadoEm && new Date(orc.propostas_em) > new Date(enviadoEm));
  if (ORIGENS_AUTOMATICAS.includes(String(orc.origem_lead || '').toUpperCase()) && (!enviadoEm || propostasMaisNovas)) {
    const esperados = TIPOS.filter((t) => orc[t.idCol]);
    const prontos = esperados.filter((t) => orc[t.pdfCol]);
    if (esperados.length > 0 && prontos.length === esperados.length) {
      envioAuto = await despacharPdfs(orc, true);
    }
  }
  return { ok: true, slug: orc.slug, cliente: orc.cliente, tipo: tipoInfo.tipo, rotulo,
    envioAuto: envioAuto ? (envioAuto.ok ? 'enviado' : `falhou: ${envioAuto.error}`) : undefined };
}

export async function criarSlotPdf(req, res) {
  if (req.headers['x-hub-token'] !== process.env.HUB_PDF_TOKEN) return res.status(401).json({ ok: false, error: 'Token invalido.' });
  try {
    const num = parseInt(req.query?.numero || req.body?.numero, 10);
    if (!num) return res.status(400).json({ ok: false, error: 'numero obrigatorio.' });
    const r = await resolverOrc(num);
    if (!r) return res.status(200).json({ ok: false, error: `Nenhum orçamento vinculado à proposta nº ${num}.` });

    const base = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    // Garante o bucket (idempotente).
    await supabaseAdmin.storage.createBucket(BUCKET, { public: false }).catch(() => {});

    /* URL assinada de upload via REST — nao depende da versao do SDK ter
       createSignedUploadUrl (a da Vercel nao tinha, e a funcao crashava). */
    const signRes = await fetch(`${base}/storage/v1/object/upload/sign/${BUCKET}/${r.path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' },
    });
    const signBody = await signRes.text();
    if (!signRes.ok) return res.status(200).json({ ok: false, error: `Falha ao criar slot (HTTP ${signRes.status}): ${signBody.slice(0, 160)}` });
    let signed;
    try { signed = JSON.parse(signBody); } catch (_) { signed = {}; }
    // A REST devolve { url: "/object/upload/sign/BUCKET/path?token=..." }
    const rel = signed.url || `/object/upload/sign/${BUCKET}/${r.path}?token=${signed.token || ''}`;
    const uploadUrl = `${base}/storage/v1${rel.startsWith('/') ? rel : '/' + rel}`;
    return res.status(200).json({ ok: true, uploadUrl, path: r.path, numero: num });
  } catch (e) {
    console.error('[proposta-pdf] criarSlotPdf falhou:', e);
    return res.status(200).json({ ok: false, error: `Erro no slot: ${e.message}` });
  }
}

export async function finalizarPdf(req, res) {
  if (req.headers['x-hub-token'] !== process.env.HUB_PDF_TOKEN) return res.status(401).json({ ok: false, error: 'Token invalido.' });
  try {
    const num = parseInt(req.query?.numero || req.body?.numero, 10);
    if (!num) return res.status(400).json({ ok: false, error: 'numero obrigatorio.' });
    const r = await resolverOrc(num);
    if (!r) return res.status(200).json({ ok: false, error: `Nenhum orçamento vinculado à proposta nº ${num}.` });
    const { data: files } = await supabaseAdmin.storage.from(BUCKET).list('', { limit: 100, search: r.path });
    if (!files?.some((f) => f.name === r.path)) {
      return res.status(200).json({ ok: false, error: 'PDF ainda nao chegou ao storage.' });
    }
    return res.status(200).json(await finalizarNoOrc(r.orc, r.tipoInfo, r.path));
  } catch (e) {
    console.error('[proposta-pdf] finalizarPdf falhou:', e);
    return res.status(200).json({ ok: false, error: `Erro ao finalizar: ${e.message}` });
  }
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
  // O arquivo é substituído a cada recaptura: nenhum intermediário pode guardar.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`
  );
  res.status(200).send(Buffer.from(await file.arrayBuffer()));
}
