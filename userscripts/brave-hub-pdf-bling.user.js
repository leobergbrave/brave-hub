// ==UserScript==
// @name         Brave HUB — PDF Bling automático
// @namespace    https://brave-hub-two.vercel.app
// @version      1.4
// @description  Captura a proposta oficial do Bling na tela de impressão e envia ao Brave HUB, que gera e guarda o PDF. Fluxo: Salvar → Imprimir → Ok, e pronto.
// @match        https://www.bling.com.br/relatorios/orcamento.impressao.php*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const HUB = 'https://brave-hub-two.vercel.app';
  const TOKEN = '81078d0c8ae70afe4e014d850f7245a70a20da55c9ef92e0';

  // --- aviso flutuante -------------------------------------------------------
  // NUNCA pode sair no PDF: por isso tem id próprio (removido do clone enviado
  // ao HUB) e @media print, que o esconde também no Salvar-como-PDF do Chrome.
  const estiloPrint = document.createElement('style');
  estiloPrint.setAttribute('data-brave-hub', '1');
  estiloPrint.textContent = '@media print { #brave-hub-aviso { display: none !important; } }';
  document.head.appendChild(estiloPrint);

  const box = document.createElement('div');
  box.id = 'brave-hub-aviso';
  box.setAttribute('data-brave-hub', '1');
  box.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px', 'z-index:999999',
    'background:#111', 'color:#fff', 'padding:12px 18px', 'border-radius:12px',
    'font:600 14px/1.4 system-ui,sans-serif', 'box-shadow:0 4px 20px rgba(0,0,0,.35)',
    'max-width:340px',
  ].join(';');
  const VERSAO = '1.4';
  const setBox = (msg, cor) => { box.textContent = msg; box.style.background = cor || '#111'; };
  document.body.appendChild(box);
  setBox(`⏳ BRAVE HUB v${VERSAO}: capturando proposta...`);

  // Cinto e suspensório: além do @media print, some o aviso no momento em que
  // a impressão começa. Cobre o caso do preview do Chrome já estar aberto
  // quando o script injeta o aviso (o preview re-renderiza a cada mudança).
  const esconder = () => { box.style.display = 'none'; };
  const mostrar = () => { box.style.display = ''; };
  window.addEventListener('beforeprint', esconder);
  window.addEventListener('afterprint', mostrar);
  try {
    const mq = window.matchMedia('print');
    mq.addEventListener('change', (e) => (e.matches ? esconder() : mostrar()));
  } catch (_) { /* navegador antigo: o @media print já cobre */ }

  // --- helpers ---------------------------------------------------------------
  const blobParaDataURL = (blob) => new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });

  async function urlParaDataURL(url) {
    try {
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) return null;
      return await blobParaDataURL(await r.blob());
    } catch (_) { return null; }
  }

  async function montarHTML() {
    // Clona o documento para inlinar tudo sem mexer na página visível.
    const clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('script').forEach((s) => s.remove());
    // Tira TUDO que este script injetou — o PDF é o documento oficial do Bling,
    // nada nosso pode aparecer nele.
    clone.querySelectorAll('#brave-hub-aviso, [data-brave-hub]').forEach((el) => el.remove());

    // CSS: troca <link rel=stylesheet> por <style> com o conteúdo baixado na sessão.
    const linksOrig = [...document.querySelectorAll('link[rel="stylesheet"]')];
    const linksClone = [...clone.querySelectorAll('link[rel="stylesheet"]')];
    for (let i = 0; i < linksOrig.length; i++) {
      try {
        const css = await fetch(linksOrig[i].href, { credentials: 'include' }).then((r) => r.text());
        const st = document.createElement('style');
        st.textContent = css;
        if (linksClone[i]) linksClone[i].replaceWith(st);
      } catch (_) { /* mantém o link; o PDF sai sem esse css */ }
    }

    // Imagens (logo + fotos dos produtos): viram data URI, senão o servidor não
    // consegue baixá-las (exigem a sessão logada do Bling).
    const imgsOrig = [...document.querySelectorAll('img')];
    const imgsClone = [...clone.querySelectorAll('img')];
    for (let i = 0; i < imgsOrig.length; i++) {
      const data = await urlParaDataURL(imgsOrig[i].currentSrc || imgsOrig[i].src);
      if (data && imgsClone[i]) {
        imgsClone[i].setAttribute('src', data);
        imgsClone[i].removeAttribute('srcset');
      }
    }

    return '<!DOCTYPE html>\n' + clone.outerHTML;
  }

  function acharNumero() {
    // 1) Tabela "Número da Proposta | 8026": o número está na célula VIZINHA,
    // então innerText traz uma quebra de linha no meio — \s+ cobre os dois casos.
    const texto = document.body.innerText || '';
    const padroes = [
      /N[úu]mero\s+da\s+Proposta\s*:?\s*(\d{1,10})/i,
      /Proposta\s*N[ºo°]?\s*\.?\s*:?\s*(\d{1,10})/i,
    ];
    for (const p of padroes) {
      const m = texto.match(p);
      if (m) return m[1];
    }
    // 2) Fallback estrutural: acha a célula com o rótulo e lê a célula seguinte.
    for (const td of document.querySelectorAll('td, th')) {
      if (!/n[úu]mero\s+da\s+proposta/i.test(td.textContent || '')) continue;
      const val = (td.nextElementSibling?.textContent || '').replace(/\D/g, '');
      if (val) return val;
    }
    return null;
  }

  // --- fluxo principal -------------------------------------------------------
  async function enviar() {
    const numero = acharNumero();
    if (!numero) {
      setBox(`❌ BRAVE HUB v${VERSAO}: não achei o nº da proposta nesta página.`, '#7f1d1d');
      return;
    }
    setBox(`⏳ BRAVE HUB v${VERSAO}: enviando proposta nº ${numero}...`);
    const html = await montarHTML();
    try {
      const r = await fetch(`${HUB}/api/bling?acao=proposta_pdf_upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-token': TOKEN },
        body: JSON.stringify({ numero, html }),
      });
      const j = await r.json();
      if (j.ok) {
        const rot = j.rotulo ? ` ${j.rotulo}` : '';
        setBox(`✅ BRAVE HUB v${VERSAO}: PDF${rot} da proposta nº ${numero} pronto (${j.cliente}). Pode fechar esta aba.`, '#14532d');
      } else {
        setBox(`❌ BRAVE HUB v${VERSAO}: ${j.error || 'erro desconhecido'}`, '#7f1d1d');
      }
    } catch (e) {
      setBox(`❌ BRAVE HUB v${VERSAO}: falha de rede — ${e.message}`, '#7f1d1d');
    }
  }

  // Espera as imagens carregarem antes de capturar.
  const imgs = [...document.images];
  Promise.all(imgs.map((im) => im.complete
    ? Promise.resolve()
    : new Promise((res) => { im.addEventListener('load', res); im.addEventListener('error', res); })
  )).then(() => setTimeout(enviar, 400));
})();
