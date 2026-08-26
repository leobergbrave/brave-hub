// ==UserScript==
// @name         Brave HUB — Investigar envio de anexo no FSS (temporário)
// @namespace    bravefitness.com.br
// @version      1.0
// @description  Descobre COMO o FSS envia um anexo. Instale, mande UM PDF na mão numa conversa, copie o resultado e me envie. Depois pode desinstalar.
// @match        https://app.fullsalessystem.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * Script de diagnóstico — não faz parte do fluxo de produção.
 *
 * Por que existe: entregar o arquivo por fora esbarra numa barreira diferente
 * em cada lugar (campo escondido no site, app que não aceita compartilhamento).
 * Se descobrirmos a chamada que o próprio FSS faz ao enviar um anexo, o envio
 * passa a sair do nosso servidor e funciona em qualquer lugar.
 *
 * Foi assim que descobrimos a impressão do Bling (um POST de formulário com
 * idOrcamento), e aquilo destravou todo o resto.
 *
 * Registra fetch e XHR, com atenção a uploads (FormData / arquivo no corpo).
 * Não guarda o conteúdo do arquivo — só o endereço, o método e os campos.
 */

(function () {
  'use strict';

  const achados = [];
  const INTERESSE = /upload|attach|media|file|message|conversation|send/i;

  const resumirCorpo = (corpo) => {
    if (!corpo) return '(vazio)';
    if (corpo instanceof FormData) {
      const partes = [];
      for (const [k, v] of corpo.entries()) {
        partes.push(v instanceof File
          ? `${k}=<ARQUIVO ${v.name} ${v.type} ${Math.round(v.size / 1024)}KB>`
          : `${k}=${String(v).slice(0, 60)}`);
      }
      return 'FormData { ' + partes.join(' | ') + ' }';
    }
    if (corpo instanceof File || corpo instanceof Blob) {
      return `<BINARIO ${corpo.type || '?'} ${Math.round(corpo.size / 1024)}KB>`;
    }
    return String(corpo).slice(0, 400);
  };

  const registrar = (via, dados) => {
    achados.push({ via, ...dados, quando: new Date().toLocaleTimeString('pt-BR') });
    desenhar();
  };

  // fetch
  const fetchOriginal = window.fetch;
  window.fetch = function (entrada, init) {
    try {
      const url = typeof entrada === 'string' ? entrada : entrada?.url;
      const metodo = (init?.method || (typeof entrada !== 'string' && entrada?.method) || 'GET').toUpperCase();
      if (url && metodo !== 'GET' && INTERESSE.test(url)) {
        registrar('fetch', { url, metodo, corpo: resumirCorpo(init?.body) });
      }
    } catch (_) { /* nunca atrapalhar a pagina */ }
    return fetchOriginal.apply(this, arguments);
  };

  // XMLHttpRequest
  const abrirOriginal = XMLHttpRequest.prototype.open;
  const enviarOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__bh = { metodo: String(metodo || '').toUpperCase(), url: String(url || '') };
    return abrirOriginal.apply(this, [metodo, url, ...resto]);
  };
  XMLHttpRequest.prototype.send = function (corpo) {
    try {
      const i = this.__bh;
      if (i && i.metodo !== 'GET' && INTERESSE.test(i.url)) {
        registrar('XHR', { url: i.url, metodo: i.metodo, corpo: resumirCorpo(corpo) });
      }
    } catch (_) { /* idem */ }
    return enviarOriginal.apply(this, arguments);
  };

  // ── painel ────────────────────────────────────────────────────────────
  let caixa;
  function desenhar() {
    if (!document.body) return;
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.style.cssText = [
        'position:fixed', 'top:12px', 'left:12px', 'z-index:2147483647',
        'background:#0f172a', 'color:#e2e8f0', 'padding:12px 14px', 'border-radius:10px',
        'font:500 11px/1.45 ui-monospace,Menlo,monospace', 'max-width:560px',
        'max-height:65vh', 'overflow:auto', 'box-shadow:0 8px 30px rgba(0,0,0,.45)',
        'white-space:pre-wrap', 'word-break:break-all', 'cursor:pointer',
      ].join(';');
      document.body.appendChild(caixa);
    }
    const texto = achados.length
      ? achados.map((a, i) => `[${i + 1}] ${a.via} ${a.metodo} (${a.quando})\n    url: ${a.url}\n    corpo: ${a.corpo}`).join('\n\n')
      : 'Aguardando... Envie UM PDF na mão numa conversa do FSS.';
    caixa.textContent = `BRAVE HUB — investigação do anexo do FSS\n\n${texto}\n\n(clique aqui para copiar tudo)`;
    caixa.onclick = () => {
      navigator.clipboard.writeText(texto).then(() => {
        const antes = caixa.style.background;
        caixa.style.background = '#14532d';
        setTimeout(() => { caixa.style.background = antes; }, 700);
      });
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', desenhar, { once: true });
  } else {
    desenhar();
  }
})();
