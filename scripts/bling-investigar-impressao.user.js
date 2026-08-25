// ==UserScript==
// @name         Brave HUB — Investigar impressão do Bling (temporário)
// @namespace    bravefitness.com.br
// @version      1.0
// @description  Descobre COMO o Bling abre a tela de impressão da proposta. Instale, faça Salvar → Imprimir → Ok uma vez, copie o resultado e me mande. Depois pode desinstalar.
// @match        https://www.bling.com.br/orcamentos.php*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * Script de diagnóstico, não faz parte do fluxo de produção.
 *
 * Objetivo: o PDF oficial só existe quando a tela de impressão do Bling é
 * aberta na sessão logada. Para o robô abrir essa tela sozinho, precisamos
 * saber como o Bling a chama — a URL direta com ?id= não funciona.
 *
 * Este script grava as quatro formas possíveis (window.open, submit de
 * formulário, fetch e XHR) e mostra o que apareceu num painel copiável.
 */

(function () {
  'use strict';

  const achados = [];
  const registrar = (via, dados) => {
    achados.push({ via, ...dados, quando: new Date().toLocaleTimeString('pt-BR') });
    atualizar();
  };

  // 1) nova aba/janela
  const openOriginal = window.open;
  window.open = function (url, ...resto) {
    registrar('window.open', { url: String(url || '') });
    return openOriginal.apply(this, [url, ...resto]);
  };

  // 2) formulário enviado (POST costuma ser assim)
  const submitOriginal = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    registrar('form.submit', {
      url: this.action, metodo: this.method,
      campos: [...new FormData(this).entries()].map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(' | '),
    });
    return submitOriginal.apply(this, arguments);
  };
  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (!(f instanceof HTMLFormElement)) return;
    registrar('submit (evento)', {
      url: f.action, metodo: f.method, alvo: f.target,
      campos: [...new FormData(f).entries()].map(([k, v]) => `${k}=${String(v).slice(0, 60)}`).join(' | '),
    });
  }, true);

  // 3) fetch
  const fetchOriginal = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url;
    if (/impress|orcamento|proposta|relatorio/i.test(url || '')) {
      registrar('fetch', { url, metodo: init?.method || 'GET', corpo: String(init?.body || '').slice(0, 200) });
    }
    return fetchOriginal.apply(this, arguments);
  };

  // 4) XMLHttpRequest
  const abrirOriginal = XMLHttpRequest.prototype.open;
  const enviarOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    this.__bh = { metodo, url };
    return abrirOriginal.apply(this, [metodo, url, ...resto]);
  };
  XMLHttpRequest.prototype.send = function (corpo) {
    const i = this.__bh;
    if (i && /impress|orcamento|proposta|relatorio/i.test(i.url || '')) {
      registrar('XHR', { url: i.url, metodo: i.metodo, corpo: String(corpo || '').slice(0, 200) });
    }
    return enviarOriginal.apply(this, arguments);
  };

  // ── painel ────────────────────────────────────────────────────────────
  let caixa;
  function atualizar() {
    if (!document.body) return;
    if (!caixa) {
      caixa = document.createElement('div');
      caixa.style.cssText = [
        'position:fixed', 'top:12px', 'left:12px', 'z-index:2147483647',
        'background:#0f172a', 'color:#e2e8f0', 'padding:12px 14px', 'border-radius:10px',
        'font:500 11px/1.45 ui-monospace,Menlo,monospace', 'max-width:520px',
        'max-height:60vh', 'overflow:auto', 'box-shadow:0 8px 30px rgba(0,0,0,.45)',
        'white-space:pre-wrap', 'word-break:break-all',
      ].join(';');
      document.body.appendChild(caixa);
    }
    const texto = achados.length
      ? achados.map((a, i) => `[${i + 1}] ${a.via} (${a.quando})\n` +
          Object.entries(a).filter(([k]) => !['via', 'quando'].includes(k))
            .map(([k, v]) => `    ${k}: ${v}`).join('\n')).join('\n\n')
      : 'Nada capturado ainda. Faça: Salvar → Imprimir → Ok.';
    caixa.textContent = `BRAVE HUB — investigação da impressão\n\n${texto}\n\n(clique aqui para copiar tudo)`;
    caixa.onclick = () => {
      navigator.clipboard.writeText(texto).then(() => {
        const antes = caixa.style.background;
        caixa.style.background = '#14532d';
        setTimeout(() => { caixa.style.background = antes; }, 700);
      });
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', atualizar, { once: true });
  } else {
    atualizar();
  }
})();
