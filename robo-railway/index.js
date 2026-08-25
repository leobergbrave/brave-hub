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

  // Seletores defensivos: o Bling muda o layout de tempos em tempos.
  const campoUsuario = await pagina.$('input[type="email"], input[name*="user" i], input[name*="login" i], input[type="text"]');
  const campoSenha = await pagina.$('input[type="password"]');
  if (!campoUsuario || !campoSenha) {
    log('ERRO: não achei os campos de login (layout mudou?)');
    return false;
  }

  await campoUsuario.type(BLING_USUARIO, { delay: 40 });
  await campoSenha.type(BLING_SENHA, { delay: 40 });
  await Promise.all([
    pagina.keyboard.press('Enter'),
    pagina.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60_000 }).catch(() => {}),
  ]);
  await sleep(3000);

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
  log(`login falhou (${falhasLogin}/${MAX_FALHAS_LOGIN})`);
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

  return pagina.evaluate(async () => {
    const paraDataURL = async (url) => {
      try {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) return null;
        const blob = await r.blob();
        return await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
      } catch (_) { return null; }
    };

    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script').forEach((s) => s.remove());

    const linksOrig = [...document.querySelectorAll('link[rel="stylesheet"]')];
    const linksClone = [...clone.querySelectorAll('link[rel="stylesheet"]')];
    for (let i = 0; i < linksOrig.length; i++) {
      try {
        const css = await fetch(linksOrig[i].href, { credentials: 'include' }).then((r) => r.text());
        const st = document.createElement('style');
        st.textContent = css;
        if (linksClone[i]) linksClone[i].replaceWith(st);
      } catch (_) { /* segue sem esse css */ }
    }

    const imgsOrig = [...document.querySelectorAll('img')];
    const imgsClone = [...clone.querySelectorAll('img')];
    for (let i = 0; i < imgsOrig.length; i++) {
      const data = await paraDataURL(imgsOrig[i].currentSrc || imgsOrig[i].src);
      if (data && imgsClone[i]) {
        imgsClone[i].setAttribute('src', data);
        imgsClone[i].removeAttribute('srcset');
      }
    }

    const texto = document.body.innerText || '';
    let numero = null;
    for (const p of [/N[úu]mero\s+da\s+Proposta\s*:?\s*(\d{1,10})/i, /Proposta\s*N[ºo°]?\s*\.?\s*:?\s*(\d{1,10})/i]) {
      const m = texto.match(p);
      if (m) { numero = m[1]; break; }
    }
    if (!numero) {
      for (const td of document.querySelectorAll('td, th')) {
        if (!/n[úu]mero\s+da\s+proposta/i.test(td.textContent || '')) continue;
        const v = (td.nextElementSibling?.textContent || '').replace(/\D/g, '');
        if (v) { numero = v; break; }
      }
    }
    return { numero, html: '<!DOCTYPE html>\n' + clone.outerHTML };
  });
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
        const { numero, html } = await capturarProposta(p.idOrcamento);
        const num = p.numero || numero;
        if (!num) throw new Error('não achei o nº da proposta');

        const env = await fetch(`${HUB}/api/bling?acao=proposta_pdf_upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-hub-token': TOKEN },
          body: JSON.stringify({ numero: num, html }),
        });
        const resp = await env.json();
        if (!resp.ok) throw new Error(resp.error || 'HUB recusou');
        log(`  → pronta${resp.envioAuto === 'enviado' ? ' e enviada ao cliente' : ''}`);
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
