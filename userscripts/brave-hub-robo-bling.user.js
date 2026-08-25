// ==UserScript==
// @name         Brave HUB — Robô de propostas do Bling
// @namespace    https://brave-hub-two.vercel.app
// @version      1.3
// @description  Captura sozinho os PDFs oficiais das propostas pendentes, em janela invisível. Basta deixar o Bling aberto numa aba.
// @match        https://www.bling.com.br/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * O que faz: pergunta ao HUB quais propostas ainda não têm PDF, abre cada uma
 * na tela de impressão do Bling DENTRO de um iframe invisível, espera carregar,
 * e envia o documento pronto. O Léo não clica em nada — só precisa ter o Bling
 * aberto em alguma aba.
 *
 * Como a impressão é aberta (descoberto em 25/08/2026 inspecionando o fluxo real):
 *   POST https://www.bling.com.br/relatorios/orcamento.impressao.php
 *   campos: idOrcamento=<id da proposta>&imprimeOrdem=I
 * Não existe URL navegável com ?id= — por isso montamos o mesmo formulário e
 * apontamos para o iframe.
 *
 * Cuidados que o código toma:
 * - uma proposta por vez, com intervalo: nada de martelar o Bling;
 * - só captura quando o conteúdo real chegou (a tela nasce "Carregando...");
 * - CSS e imagens viram data URI, senão o servidor não conseguiria baixá-las
 *   (exigem a sessão logada);
 * - não roda na própria tela de impressão, que já tem o script de captura.
 */

(function () {
  'use strict';

  if (location.pathname.includes('/relatorios/orcamento.impressao.php')) return;

  const HUB = 'https://brave-hub-two.vercel.app';
  const TOKEN = '81078d0c8ae70afe4e014d850f7245a70a20da55c9ef92e0';
  const VERSAO = '1.3';
  const INTERVALO_MS = 45 * 1000;   // de quanto em quanto tempo procura pendências
  const ESPERA_MAX_MS = 40 * 1000;  // tempo máximo esperando uma proposta carregar

  let ocupado = false;

  // ── aviso discreto ────────────────────────────────────────────────────
  const aviso = document.createElement('div');
  aviso.id = 'brave-hub-robo';
  aviso.style.cssText = [
    'position:fixed', 'bottom:14px', 'left:14px', 'z-index:2147483647',
    'background:#0f172a', 'color:#e2e8f0', 'padding:9px 13px', 'border-radius:9px',
    'font:600 12px/1.35 system-ui,sans-serif', 'box-shadow:0 4px 18px rgba(0,0,0,.35)',
    'max-width:320px', 'opacity:.92', 'pointer-events:none',
  ].join(';');
  const estilo = document.createElement('style');
  estilo.textContent = '@media print { #brave-hub-robo { display: none !important; } }';
  const setAviso = (txt, cor) => {
    aviso.textContent = txt;
    aviso.style.background = cor || '#0f172a';
  };
  document.addEventListener('DOMContentLoaded', () => {}, { once: true });
  if (document.head) document.head.appendChild(estilo);
  if (document.body) document.body.appendChild(aviso);
  setAviso(`🤖 Robô BRAVE v${VERSAO} ativo`);

  // ── captura de uma proposta dentro de iframe invisível ────────────────
  function abrirNoIframe(idOrcamento) {
    return new Promise((resolve, reject) => {
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:1400px;border:0;opacity:0';
      iframe.name = 'bh_captura_' + Date.now();
      document.body.appendChild(iframe);

      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://www.bling.com.br/relatorios/orcamento.impressao.php';
      form.target = iframe.name;
      form.style.display = 'none';
      for (const [nome, valor] of [['idOrcamento', idOrcamento], ['imprimeOrdem', 'I']]) {
        const i = document.createElement('input');
        i.type = 'hidden'; i.name = nome; i.value = valor;
        form.appendChild(i);
      }
      document.body.appendChild(form);
      form.submit();
      form.remove();

      /* A tela de impressao chama window.print() sozinha. Mesmo dentro de um
         iframe, esse dialogo e o do Chrome inteiro — e ele CONGELA o JavaScript
         da pagina, travando o robo no meio da captura. Como o iframe e da mesma
         origem, silenciamos o print dele assim que o documento existe; o loop
         curto cobre o intervalo entre o submit e o carregamento. */
      const silenciar = setInterval(() => {
        try {
          const w = iframe.contentWindow;
          if (w && w.print && !w.__bhSilenciado) {
            w.print = function () {};
            w.__bhSilenciado = true;
          }
        } catch (_) { /* ainda navegando */ }
      }, 10);

      const inicio = Date.now();
      const timer = setInterval(() => {
        let doc = null;
        try { doc = iframe.contentDocument; } catch (_) { /* ainda navegando */ }
        const texto = doc?.body?.innerText || '';
        const pronto = doc && doc.readyState === 'complete'
          && !/carregando/i.test(texto)
          && /total\s+da\s+proposta|n[ºo°]?\s*de\s+itens/i.test(texto)
          && doc.querySelectorAll('table').length >= 2
          && [...doc.images].every((im) => im.complete);
        if (pronto) {
          clearInterval(timer); clearInterval(silenciar);
          resolve({ iframe, doc });
        } else if (Date.now() - inicio > ESPERA_MAX_MS) {
          clearInterval(timer); clearInterval(silenciar);
          iframe.remove();
          reject(new Error('a proposta não carregou a tempo'));
        }
      }, 500);
    });
  }

  async function urlParaDataURL(url) {
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
  }

  async function montarHTML(doc) {
    const clone = doc.documentElement.cloneNode(true);
    clone.querySelectorAll('script').forEach((s) => s.remove());
    clone.querySelectorAll('#brave-hub-aviso, #brave-hub-robo, [data-brave-hub]').forEach((e) => e.remove());

    const linksOrig = [...doc.querySelectorAll('link[rel="stylesheet"]')];
    const linksClone = [...clone.querySelectorAll('link[rel="stylesheet"]')];
    for (let i = 0; i < linksOrig.length; i++) {
      try {
        const css = await fetch(linksOrig[i].href, { credentials: 'include' }).then((r) => r.text());
        const st = doc.createElement('style');
        st.textContent = css;
        if (linksClone[i]) linksClone[i].replaceWith(st);
      } catch (_) { /* segue sem esse css */ }
    }

    const imgsOrig = [...doc.querySelectorAll('img')];
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

  function acharNumero(doc) {
    const texto = doc.body.innerText || '';
    for (const p of [/N[úu]mero\s+da\s+Proposta\s*:?\s*(\d{1,10})/i, /Proposta\s*N[ºo°]?\s*\.?\s*:?\s*(\d{1,10})/i]) {
      const m = texto.match(p);
      if (m) return m[1];
    }
    for (const td of doc.querySelectorAll('td, th')) {
      if (!/n[úu]mero\s+da\s+proposta/i.test(td.textContent || '')) continue;
      const v = (td.nextElementSibling?.textContent || '').replace(/\D/g, '');
      if (v) return v;
    }
    return null;
  }

  async function capturar(p) {
    setAviso(`🤖 Capturando proposta de ${p.cliente} (${p.tipo})...`);
    const { iframe, doc } = await abrirNoIframe(p.idOrcamento);
    try {
      const numero = p.numero || acharNumero(doc);
      if (!numero) throw new Error('não achei o nº da proposta');
      setAviso(`🤖 ${p.cliente} (${p.tipo}) — montando documento...`);
      const html = await montarHTML(doc);
      const r = await fetch(`${HUB}/api/bling?acao=proposta_pdf_upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-token': TOKEN },
        body: JSON.stringify({ numero, html }),
      });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'erro no HUB');
      const enviado = j.envioAuto === 'enviado' ? ' 📲 enviada ao cliente!' : '';
      setAviso(`✅ ${p.cliente} — proposta ${numero} (${p.tipo}) pronta.${enviado}`, '#14532d');
      return true;
    } finally {
      iframe.remove();
    }
  }

  // ── laço principal ────────────────────────────────────────────────────
  async function rodar() {
    // Sem checar document.hidden: o Chrome apenas desacelera timers em aba
    // oculta, e exigir a aba em primeiro plano fazia o robo parecer travado
    // enquanto o Leo trabalhava em outra aba.
    if (ocupado) return;
    ocupado = true;
    try {
      const r = await fetch(`${HUB}/api/bling?acao=propostas_pendentes`, { headers: { 'x-hub-token': TOKEN } });
      const j = await r.json();
      const fila = j.pendentes || [];
      if (!fila.length) {
        setAviso(`🤖 Robô BRAVE v${VERSAO} — nada pendente`);
        return;
      }
      setAviso(`🤖 ${fila.length} proposta(s) para capturar...`);
      for (const p of fila) {
        try {
          await capturar(p);
        } catch (e) {
          setAviso(`⚠️ ${p.cliente} (${p.tipo}): ${e.message}`, '#7c2d12');
        }
        await new Promise((res) => setTimeout(res, 4000)); // respiro entre capturas
      }
    } catch (e) {
      setAviso(`⚠️ Robô: ${e.message}`, '#7c2d12');
    } finally {
      ocupado = false;
    }
  }

  /* Por que um Worker em vez de setInterval:
     o Chrome desacelera (e o Memory Saver chega a congelar) timers de abas em
     segundo plano — por isso o robo so acordava quando a pagina era atualizada
     na mao. Timers dentro de um Worker dedicado nao sofrem esse afrouxamento,
     entao a ronda continua com o Bling em aba de fundo.
     Alem disso, disparamos ao voltar para a aba: se o Chrome tiver congelado
     tudo mesmo assim, o robo retoma no instante em que a aba e reaberta. */
  function iniciarRonda() {
    try {
      const codigo = `let t=null;onmessage=e=>{if(t)clearInterval(t);t=setInterval(()=>postMessage(1),${INTERVALO_MS});postMessage(1);};`;
      const url = URL.createObjectURL(new Blob([codigo], { type: 'application/javascript' }));
      const w = new Worker(url);
      w.onmessage = () => rodar();
      w.postMessage('iniciar');
      return true;
    } catch (_) {
      // Worker bloqueado: cai no timer comum (funciona com a aba em primeiro plano)
      setInterval(rodar, INTERVALO_MS);
      return false;
    }
  }

  setTimeout(iniciarRonda, 3000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rodar(); });
  window.addEventListener('focus', rodar);
  window.addEventListener('online', rodar);
})();
