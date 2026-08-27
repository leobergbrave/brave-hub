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
const COLS = 'id, slug, cliente, consultor, payload, origem_lead, propostas_em, proposta_pdf_enviado_em, bling_avista_id, bling_avista_numero, bling_avista_pdf, bling_prazo_id, bling_prazo_numero, bling_prazo_pdf, bling_pedido_id, bling_proposta_numero, proposta_pdf_path';

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

  /* Trava contra proposta pela metade: a tela do Bling nasce com "Carregando..."
     e um cliente já recebeu um PDF com essa única palavra. O servidor confere
     antes de gravar — PDF errado enviado ao cliente não tem desfazer.
     Validamos pela PRESENÇA do que a proposta pronta tem, nunca pela ausência
     de "Carregando": o Bling deixa essa div escondida no documento mesmo depois
     de carregar, e checar por ela recusava proposta boa. */
  const semTags = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const marcadores = [
    /total\s+da\s+proposta/i,
    /n[ºo°]?\s*de\s+itens/i,
    /itens\s+da\s+proposta/i,
  ].filter((re) => re.test(semTags)).length;
  if (marcadores === 0) {
    return res.status(200).json({
      ok: false,
      error: 'A página ainda não tinha carregado a proposta (documento incompleto). Recarregue a tela de impressão no Bling e tente de novo.',
    });
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
  /* Reenviar quando o orçamento é editado: as propostas passam a ser mais
     novas que o último envio, e o cliente precisa receber os valores atuais.
     Sem isso, editar não reenviava nada. Reimprimir a MESMA proposta continua
     não reenviando — o que muda é a data das propostas, não a da captura. */
  const enviadoEm = orc.proposta_pdf_enviado_em;
  const propostasMaisNovas = !!(orc.propostas_em && enviadoEm
    && new Date(orc.propostas_em) > new Date(enviadoEm));
  if (ORIGENS_AUTOMATICAS.includes(String(orc.origem_lead || '').toUpperCase())
      && (!enviadoEm || propostasMaisNovas)) {
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
  /* O caminho leva um carimbo de versão (/v<epoch>/) porque WhatsApp e
     BotConversa cacheiam mídia POR URL: ao reenviar uma proposta recapturada
     na mesma URL, o cliente recebia de volta o arquivo antigo do cache, sem o
     servidor ser consultado. Endereço novo a cada envio elimina isso. */
  const arquivos = disponiveis.map((t) => linkPdf(orc, t));

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

  /* Só o lead da central (FSS) recebe apresentação: para ele esta é a primeira
     mensagem no WhatsApp do consultor, e o texto vem do fluxo do BotConversa
     que fazia esse papel (fluxo desligado por mandar o LINK do orçamento).
     Nos demais canais — WhatsApp BRAVE e Venda Direta — a conversa já está em
     andamento, e reapresentar-se soaria automatizado: ali vão só as propostas e
     o fechamento com os valores. */
  const primeiroNome = String(orc.cliente || 'Cliente').trim().split(/\s+/)[0].toUpperCase();
  const daCentral = String(orc.origem_lead || '').toUpperCase() === 'FSS';
  const consultor = orc.consultor || 'Léo Berg';

  const aberturas = daCentral ? [
    `Fala ${primeiroNome} tudo bem?\n${consultor} da BRAVE aqui👍`,
    'Estamos nos falando ali pelo número da central, mas estou te enviando o orçamento por aqui também para fazer a melhor negociação pra você',
  ] : [];

  for (const texto of aberturas) {
    const r = await enviar({ type: 'text', value: texto });
    if (!r.ok) {
      return { ok: false, error: `BotConversa recusou o envio (HTTP ${r.status}): ${r.texto.slice(0, 250)}` };
    }
    await sleep(700);
  }

  const enviados = [];
  const falhas = [];
  for (const a of arquivos) {
    const r = await enviar({ type: 'file', value: a.url });
    (r.ok ? enviados : falhas).push(a.tipo);
    await sleep(600);
  }

  if (enviados.length > 0) {
    /* Fechamento com os valores por escrito: o cliente recebe dois arquivos
       parecidos e precisa saber qual é qual — e quanto dá — sem abrir os dois.
       Os números saem do payload do próprio orçamento (mesma conta que gerou as
       propostas no Bling), nunca de leitura do PDF: valor errado numa proposta
       comercial é problema sério, e cálculo não erra onde interpretação erra. */
    const temDuas = enviados.includes('avista') && enviados.includes('prazo');
    await sleep(700);
    await enviar({ type: 'text', value: montarResumo(orc, temDuas) });
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
    // arquivos prontos para o userscript do FSS anexar direto na conversa
    arquivos: TIPOS.filter(t => achado[t.pdfCol])
      .map(t => ({ ...linkPdf(achado, t), mensagem: mensagemDoTipo(achado, t.tipo) })),
    /* Mesmo texto que vai no WhatsApp — no FSS a conversa já está em andamento,
       então vale só o fechamento com os valores, sem a apresentação. */
    mensagem: montarResumo(
      achado,
      !!(achado.bling_avista_pdf && achado.bling_prazo_pdf)
    ),
  });
}

/* GET /api/bling?acao=propostas_pendentes  (header x-hub-token)
   Lista as propostas que ja existem no Bling mas ainda nao tiveram o PDF
   capturado. O robo do Bling consome isso para imprimir sozinho, num iframe
   invisivel, sem o Leo clicar em nada. */
export async function propostasPendentes(req, res) {
  if (req.headers['x-hub-token'] !== process.env.HUB_PDF_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Token invalido.' });
  }
  /* Trava de seguranca: so orcamentos recentes. Sem isso o primeiro ciclo do
     robo varreria o historico inteiro (21 propostas antigas na estreia) e,
     nas de origem FSS, dispararia WhatsApp para clientes de semanas atras.
     O uso real e sempre uma proposta recem-criada. */
  const JANELA_HORAS = Number(process.env.ROBO_JANELA_HORAS || 72);
  const corte = new Date(Date.now() - JANELA_HORAS * 3600 * 1000).toISOString();
  /* A janela mede quando as PROPOSTAS foram criadas, não o orçamento: um
     orçamento de semanas atrás, regerado hoje, tem propostas novas e precisa
     ser capturado. Usar criado_em deixava esse caso de fora (visto em
     produção com o Forma Fit). Orçamentos antigos sem propostas_em continuam
     protegidos pelo criado_em. */
  const { data: linhas } = await supabaseAdmin
    .from('orcamentos_salvos')
    .select(COLS)
    .or(`propostas_em.gte.${corte},and(propostas_em.is.null,criado_em.gte.${corte})`)
    .or(TIPOS.map(t => `and(${t.idCol}.not.is.null,${t.pdfCol}.is.null)`).join(','))
    .order('criado_em', { ascending: false })
    .limit(20);

  const pendentes = [];
  for (const o of linhas || []) {
    if (ORIGENS_SEM_CAPTURA.includes(String(o.origem_lead || '').toUpperCase())) continue;
    for (const t of TIPOS) {
      if (o[t.idCol] && !o[t.pdfCol]) {
        pendentes.push({
          slug: o.slug, cliente: o.cliente, tipo: t.tipo,
          idOrcamento: String(o[t.idCol]), numero: o[t.numCol] || null,
        });
      }
    }
  }
  return res.status(200).json({ ok: true, pendentes });
}

/* Sessao do Bling para o robo de servidor (Railway).
   POST /api/bling?acao=sessao_bling  (header x-hub-token)  body: { cookies }
   GET  /api/bling?acao=sessao_bling  (header x-hub-token)  -> devolve os cookies

   Por que guardar cookies em vez de usuario e senha: assim o Leo nunca precisa
   entregar a senha, e a sessao ja existente e reaproveitada. O userscript
   renova isso sempre que ele abre o Bling. Sao credenciais de verdade — nunca
   logar o valor, nunca devolver sem o token. */
export async function sessaoBling(req, res) {
  if (req.headers['x-hub-token'] !== process.env.HUB_PDF_TOKEN) {
    return res.status(401).json({ ok: false, error: 'Token invalido.' });
  }

  if (req.method === 'POST') {
    const { cookies, armazenamento } = req.body || {};
    if (!cookies || typeof cookies !== 'string' || cookies.length < 20) {
      return res.status(400).json({ ok: false, error: 'cookies obrigatorios.' });
    }
    const { error } = await supabaseAdmin.from('bling_config')
      .update({
        sessao_cookies: cookies,
        sessao_storage: armazenamento ? JSON.stringify(armazenamento) : null,
        sessao_atualizada_em: new Date().toISOString(),
      })
      .eq('id', 1);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    console.log('[sessao-bling] cookies atualizados:', cookies.split(';').length, 'itens');
    return res.status(200).json({ ok: true, itens: cookies.split(';').length });
  }

  const { data } = await supabaseAdmin.from('bling_config')
    .select('sessao_cookies, sessao_storage, sessao_atualizada_em').eq('id', 1).maybeSingle();
  if (!data?.sessao_cookies) {
    return res.status(200).json({ ok: false, error: 'Nenhuma sessao guardada ainda.' });
  }
  return res.status(200).json({
    ok: true,
    cookies: data.sessao_cookies,
    armazenamento: data.sessao_storage ? JSON.parse(data.sessao_storage) : {},
    atualizadaEm: data.sessao_atualizada_em,
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
  // O arquivo é substituído a cada recaptura: nenhum intermediário pode guardar.
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(nomeArquivo)}`
  );
  res.status(200).send(Buffer.from(await file.arrayBuffer()));
}
