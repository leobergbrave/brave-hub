// ==UserScript==
// @name         Brave HUB — PDF Bling automático
// @namespace    https://brave-hub-two.vercel.app
// @version      1.0
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
  const box = document.createElement('div');
  box.style.cssText = [
    'position:fixed', 'top:16px', 'right:16px', 'z-index:999999',
    'background:#111', 'color:#fff', 'padding:12px 18px', 'border-radius:12px',
    'font:600 14px/1.4 system-ui,sans-serif', 'box-shadow:0 4px 20px rgba(0,0,0,.35)',
    'max-width:340px',
  ].join(';');
  const setBox = (msg, cor) => { box.textContent = msg; box.style.background = cor || '#111'; };
  document.body.appendChild(box);
  setBox('⏳ BRAVE HUB: capturando proposta...');

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
    const cloneBox = clone.querySelector('div[style*="999999"]');
    if (cloneBox) cloneBox.remove(); // não levar o aviso flutuante pro PDF

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
    const texto = document.body.innerText || '';
    const m = texto.match(/Proposta\s*N[ºo°]?\s*\.?\s*:?\s*(\d{1,10})/i)
      || texto.match(/N[úu]mero da Proposta\s*:?\s*(\d{1,10})/i);
    return m ? m[1] : null;
  }

  // --- fluxo principal -------------------------------------------------------
  async function enviar() {
    const numero = acharNumero();
    if (!numero) {
      setBox('❌ BRAVE HUB: não achei o nº da proposta nesta página.', '#7f1d1d');
      return;
    }
    setBox(`⏳ BRAVE HUB: enviando proposta nº ${numero}...`);
    const html = await montarHTML();
    try {
      const r = await fetch(`${HUB}/api/proposta-pdf-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-token': TOKEN },
        body: JSON.stringify({ numero, html }),
      });
      const j = await r.json();
      if (j.ok) {
        setBox(`✅ BRAVE HUB: PDF da proposta nº ${numero} pronto (${j.cliente}). Pode fechar esta aba.`, '#14532d');
      } else {
        setBox(`❌ BRAVE HUB: ${j.error || 'erro desconhecido'}`, '#7f1d1d');
      }
    } catch (e) {
      setBox(`❌ BRAVE HUB: falha de rede — ${e.message}`, '#7f1d1d');
    }
  }

  // Espera as imagens carregarem antes de capturar.
  const imgs = [...document.images];
  Promise.all(imgs.map((im) => im.complete
    ? Promise.resolve()
    : new Promise((res) => { im.addEventListener('load', res); im.addEventListener('error', res); })
  )).then(() => setTimeout(enviar, 400));
})();
