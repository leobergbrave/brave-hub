/*
 * BRAVE HUB — Robô de propostas do Bling (servidor)
 *
 * Faz o mesmo que o userscript do navegador, mas num servidor: pergunta ao HUB
 * quais propostas ainda não têm PDF, abre cada uma na tela de impressão do
 * Bling e devolve o documento pronto. A diferença é que aqui o navegador é do
 * servidor, então o Léo não precisa deixar o computador ligado.
 *
 * Como a impressão é aberta (descoberto inspecionando o fluxo real):
 *   POST https://www.bling.com.br/relatorios/orcamento.impressao.php
 *   campos: idOrcamento=<id>&imprimeOrdem=I
 * Não existe URL navegável com ?id=.
 *
 * Sobre a sessão: tentamos primeiro reaproveitar a sessão do navegador do Léo
 * (copiando cookies), e NÃO funcionou — o Bling responde UNAUTHENTICATED fora
 * do navegador de origem. Por isso aqui o serviço faz o próprio login.
 *
 * Cuidados deliberados:
 * - A sessão é reaproveitada entre ciclos: logar a cada ronda seria um padrão
 *   de acesso anormal e aumentaria a chance de a conta ser sinalizada.
 * - Ritmo humano: uma proposta por vez, com pausas.
 * - Se o login pedir 2FA/CAPTCHA, o serviço PARA e avisa, em vez de insistir —
 *   insistir em login é o caminho mais rápido para bloquear a conta.
 * - Senha só via variável de ambiente, nunca em log.
 */

import puppeteer from 'puppeteer';

const HUB = process.env.HUB_URL || 'https://brave-hub-two.vercel.app';
const TOKEN = process.env.HUB_PDF_TOKEN;
const BLING_USUARIO = process.env.BLING_USUARIO;
const BLING_SENHA = process.env.BLING_SENHA;

const INTERVALO_MS = Number(process.env.INTERVALO_SEGUNDOS || 60) * 1000;
const ESPERA_PROPOSTA_MS = 75_000;
const MAX_FALHAS_LOGIN = 3;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!TOKEN || !BLING_USUARIO || !BLING_SENHA) {
  console.error('Faltam variáveis: HUB_PDF_TOKEN, BLING_USUARIO, BLING_SENHA');
  process.exit(1);
}

let navegador = null;
let pagina = null;
let falhasLogin = 0;
let pausado = false; // liga quando o login pede 2FA/CAPTCHA

async function abrirNavegador() {
  if (navegador) return;
  navegador = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1400,1000',
    ],
  });
  pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1400, height: 1000 });
  /* Chrome headless anuncia navigator.webdriver=true e usa User-Agent
     "HeadlessChrome". Sites que servem tela vazia para automacao olham
     exatamente isso — e a tela de login veio sem nenhum campo na primeira
     tentativa. Aqui apresentamos um Chrome comum. */
  await pagina.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36');
  await pagina.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8' });
  await pagina.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
  });
  // Sem allow-modals equivalente aqui: fechamos qualquer diálogo que apareça.
  pagina.on('dialog', async (d) => { try { await d.dismiss(); } catch (_) {} });
  await pagina.evaluateOnNewDocument(() => {
    // A tela de impressão chama window.print() e trava a página esperando o
    // diálogo. No servidor não há ninguém para fechá-lo.
    window.print = function () {};
  });
}

async function estaLogado() {
  try {
    const r = await pagina.evaluate(async () => {
      const resp = await fetch('/Api/v3/propostas-comerciais/list?pagina=1', {
        headers: { Accept: 'application/json' },
      });
      return resp.status;
    });
    return r === 200;
  } catch (_) {
    return false;
  }
}

async function login() {
  if (pausado) return false;
  log('fazendo login no Bling...');
  await pagina.goto('https://www.bling.com.br/login', { waitUntil: 'networkidle2', timeout: 60_000 });

  /* A tela de login e montada por JavaScript: na primeira tentativa os campos
     ainda nao existiam quando fomos procura-los. Esperamos ate 20s por
     qualquer input aparecer antes de desistir. */
  await pagina.waitForSelector('input:not([type="hidden"])', { timeout: 20_000 }).catch(() => {});
  await sleep(1500);

  const diag = await pagina.evaluate(() => ({
    url: location.href,
    titulo: document.title,
    texto: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 250),
    campos: [...document.querySelectorAll('input')]
      .filter((i) => i.type !== 'hidden')
      .map((i) => `${i.type}[name=${i.name || '-'} id=${i.id || '-'}]`),
    iframes: document.querySelectorAll('iframe').length,
  }));
  log('tela de login → url:', diag.url, '| titulo:', diag.titulo);
  log('  campos:', diag.campos.join(' | ') || '(nenhum)', '| iframes:', diag.iframes);
  log('  texto:', diag.texto || '(vazio)');

  /* Preencher sem depender de clique: os campos existem (#username e o de
     senha) mas o Puppeteer recusa clicar — "Node is either not clickable",
     tipico de campo coberto por outro elemento. Focamos via JS e digitamos
     pelo teclado, que e o caminho que o site enxerga como digitacao real. */
  const preencher = async (seletor, valor) => {
    const existe = await pagina.$(seletor);
    if (!existe) return false;
    await pagina.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (el) { el.scrollIntoView({ block: 'center' }); el.focus(); el.value = ''; }
    }, seletor);
    await pagina.keyboard.type(valor, { delay: 60 });
    // Confere se entrou (sem revelar o conteudo)
    return pagina.evaluate((sel) => (document.querySelector(sel)?.value || '').length > 0, seletor);
  };

  if (!(await preencher('#username, input[type="text"]', BLING_USUARIO))) {
    log('ERRO: nao consegui preencher o usuario');
    return false;
  }
  if (!(await preencher('input[type="password"]', BLING_SENHA))) {
    log('ERRO: nao consegui preencher a senha');
    return false;
  }
  log('campos preenchidos, enviando...');

  // Botao "Entrar" pelo texto; se nao achar, Enter no teclado.
  const clicouBotao = await pagina.evaluate(() => {
    const alvo = [...document.querySelectorAll('button, input[type="submit"], a')]
      .find((b) => /^\s*entrar\s*$/i.test(b.innerText || b.value || ''));
    if (alvo) { alvo.click(); return true; }
    return false;
  });
  if (!clicouBotao) await pagina.keyboard.press('Enter');

  await pagina.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {});
  await sleep(5000);
  log('apos enviar login — URL:', pagina.url());

  const texto = await pagina.evaluate(() => document.body.innerText || '');
  /* Se o Bling pedir verificação, PARAMOS. Repetir login com desafio pendente é
     o comportamento que mais rápido marca a conta como comprometida — e o custo
     de perder a conta é muito maior que o de voltar ao robô do navegador. */
  if (/c[óo]digo de verifica|autentica[çc][ãa]o em dois|two.factor|verifique seu e-?mail|captcha|n[ãa]o sou um rob/i.test(texto)) {
    pausado = true;
    log('PARADO: o Bling pediu verificação extra (2FA/CAPTCHA). O robô não vai insistir.');
    log('        Use o robô do navegador enquanto isso.');
    return false;
  }

  const ok = await estaLogado();
  if (ok) {
    falhasLogin = 0;
    log('login OK');
    return true;
  }

  falhasLogin += 1;
  const pista = (await pagina.evaluate(() => document.body.innerText || ''))
    .replace(/\s+/g, ' ').slice(0, 300);
  log(`login falhou (${falhasLogin}/${MAX_FALHAS_LOGIN}) — tela diz: ${pista}`);
  if (falhasLogin >= MAX_FALHAS_LOGIN) {
    pausado = true;
    log('PARADO: três falhas de login seguidas. Confira usuário e senha nas variáveis.');
  }
  return false;
}

async function garantirSessao() {
  await abrirNavegador();
  if (await estaLogado()) return true;
  return login();
}

/* Abre a proposta na tela de impressão e devolve o HTML já com CSS e imagens
   embutidos — o HUB precisa disso porque não tem a sessão para baixá-los. */
async function capturarProposta(idOrcamento) {
  await pagina.goto('https://www.bling.com.br/inicio', { waitUntil: 'domcontentloaded', timeout: 60_000 });

  await pagina.evaluate((id) => {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://www.bling.com.br/relatorios/orcamento.impressao.php';
    for (const [nome, valor] of [['idOrcamento', id], ['imprimeOrdem', 'I']]) {
      const i = document.createElement('input');
      i.type = 'hidden'; i.name = nome; i.value = valor;
      form.appendChild(i);
    }
    document.body.appendChild(form);
    form.submit();
  }, String(idOrcamento));

  // A tela nasce "Carregando..." e busca os dados por AJAX.
  await pagina.waitForFunction(() => {
    const t = document.body?.innerText || '';
    return !/carregando/i.test(t)
      && /total\s+da\s+proposta|n[ºo°]?\s*de\s+itens/i.test(t)
      && document.querySelectorAll('table').length >= 2
      && [...document.images].every((im) => im.complete);
  }, { timeout: ESPERA_PROPOSTA_MS, polling: 500 });

  // Numero da proposta, lido da propria pagina.
  const numero = await pagina.evaluate(() => {
    const texto = document.body.innerText || '';
    for (const p of [/N[úu]mero\s+da\s+Proposta\s*:?\s*(\d{1,10})/i, /Proposta\s*N[ºo°]?\s*\.?\s*:?\s*(\d{1,10})/i]) {
      const m = texto.match(p);
      if (m) return m[1];
    }
    for (const td of document.querySelectorAll('td, th')) {
      if (!/n[úu]mero\s+da\s+proposta/i.test(td.textContent || '')) continue;
      const v = (td.nextElementSibling?.textContent || '').replace(/\D/g, '');
      if (v) return v;
    }
    return null;
  });

  /* Reduz as imagens antes de gerar o PDF. Em resolucao cheia elas incham o PDF
     a dezenas de MB — o que estourou a memoria do Chromium, o corpo da Vercel e
     o limite do Storage. Num orcamento a foto do produto e miniatura, entao
     700px de largura e qualidade 0.72 bastam e derrubam o tamanho para <2MB. */
  await pagina.evaluate(async () => {
    for (const img of [...document.images]) {
      try {
        if (!img.naturalWidth || img.naturalWidth <= 700) continue;
        const escala = 700 / img.naturalWidth;
        const c = document.createElement('canvas');
        c.width = 700;
        c.height = Math.round(img.naturalHeight * escala);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        img.src = c.toDataURL('image/jpeg', 0.72); // pode lancar se a imagem for cross-origin: ignora
      } catch (_) { /* mantem a original */ }
    }
  });
  await sleep(300);

  /* PDF gerado AQUI, na propria pagina ja logada e renderizada. O container do
     Railway tem memoria de sobra e a pagina ja esta pronta. */
  const pdf = await pagina.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '10mm', bottom: '10mm', left: '8mm', right: '8mm' },
  });

  return { numero, pdf };

}

async function ronda() {
  if (pausado) return;

  const r = await fetch(`${HUB}/api/bling?acao=propostas_pendentes`, {
    headers: { 'x-hub-token': TOKEN },
  });
  const j = await r.json();
  const fila = j.pendentes || [];
  if (!fila.length) { log('nada pendente'); return; }

  log(`${fila.length} proposta(s) para capturar`);
  if (!(await garantirSessao())) return;

  for (const p of fila) {
    if (pausado) return;
    let ok = false;
    for (let tentativa = 1; tentativa <= 2 && !ok; tentativa++) {
      try {
        log(`capturando ${p.cliente} (${p.tipo})${tentativa > 1 ? ' — 2ª tentativa' : ''}`);
        const { numero, pdf } = await capturarProposta(p.idOrcamento);
        const num = p.numero || numero;
        if (!num) throw new Error('não achei o nº da proposta');

        /* Envio em 3 passos: o PDF e grande demais para o corpo da requisicao da
           Vercel (413). Pedimos uma URL assinada, subimos os bytes direto no
           Storage do Supabase, e mandamos o HUB finalizar (grava + dispara). */
        const slotR = await fetch(`${HUB}/api/bling?acao=proposta_pdf_slot&numero=${num}`, {
          method: 'POST', headers: { 'x-hub-token': TOKEN },
        });
        const slot = await slotR.json();
        if (!slot.ok) throw new Error(slot.error || 'slot recusado');

        const up = await fetch(slot.uploadUrl, {
          method: 'PUT',
          headers: { 'content-type': 'application/pdf', 'x-upsert': 'true' },
          body: pdf,
        });
        if (!up.ok) throw new Error(`upload storage HTTP ${up.status}: ${(await up.text()).slice(0, 120)}`);

        const finR = await fetch(`${HUB}/api/bling?acao=proposta_pdf_finalizar&numero=${num}`, {
          method: 'POST', headers: { 'x-hub-token': TOKEN },
        });
        const fin = await finR.json();
        if (!fin.ok) throw new Error(fin.error || 'finalizar recusado');
        log(`  → pronta (${(pdf.length/1024).toFixed(0)}KB)${fin.envioAuto === 'enviado' ? ' e enviada ao cliente' : ''}`);
        ok = true;
      } catch (e) {
        log(`  falhou: ${e.message}`);
        if (tentativa === 1) await sleep(6000);
      }
    }
    await sleep(5000); // ritmo humano entre propostas
  }
}

async function principal() {
  log(`robô iniciado — ronda a cada ${INTERVALO_MS / 1000}s`);

  /* Um unico teste de login na partida. Normalmente o robo so loga quando ha
     proposta para capturar (logar a toa e padrao de acesso anormal), mas sem
     isso nao ha como saber se o Bling aceita o acesso do servidor enquanto a
     fila estiver vazia — e essa e a pergunta que decide se o servidor serve. */
  try {
    log('--- teste de login (uma vez, na partida) ---');
    const ok = await garantirSessao();
    log(ok ? '>>> LOGIN DO SERVIDOR FUNCIONA <<<' : '>>> login do servidor NAO passou <<<');
  } catch (e) {
    log('teste de login falhou:', e.message);
  }

  for (;;) {
    try {
      await ronda();
    } catch (e) {
      log('erro na ronda:', e.message);
      // Navegador quebrado costuma ser a causa: reabre no próximo ciclo.
      try { await navegador?.close(); } catch (_) {}
      navegador = null; pagina = null;
    }
    await sleep(INTERVALO_MS);
  }
}

principal();
