// ==UserScript==
// @name         Brave HUB — Sessão do Bling para o servidor
// @namespace    https://brave-hub-two.vercel.app
// @version      1.2
// @description  Envia ao HUB os cookies da sua sessão do Bling, para o robô do servidor capturar as propostas sem depender do seu computador.
// @match        https://www.bling.com.br/*
// @grant        GM_cookie
// @grant        GM.cookie
// @run-at       document-idle
// ==/UserScript==

/*
 * Por que existe: o PDF oficial só é gerado dentro de uma sessão logada no
 * Bling. Para o robô rodar num servidor (sem o computador do Léo ligado), esse
 * servidor precisa da sessão. Aqui ela é copiada — a senha nunca sai daqui.
 *
 * Por que GM_cookie e não document.cookie: o cookie de sessão do Bling é
 * HttpOnly, invisível para JavaScript de página (proteção contra roubo de
 * sessão). A API de cookies do Tampermonkey enxerga porque é extensão.
 *
 * Renovação: roda toda vez que uma página do Bling é aberta, no máximo uma vez
 * por hora. Assim a sessão no servidor se mantém fresca sem esforço.
 */

(function () {
  'use strict';

  const HUB = 'https://brave-hub-two.vercel.app';
  const TOKEN = '81078d0c8ae70afe4e014d850f7245a70a20da55c9ef92e0';
  const CHAVE_ULTIMO = 'brave_hub_sessao_enviada_em';
  const INTERVALO_MIN_MS = 0; // enquanto validamos: envia a cada carregamento

  /* Buscar por URL, nao por dominio: filtrar por "bling.com.br" deixava de fora
     os cookies gravados em www.bling.com.br — e o de autenticacao costuma ser
     justamente o mais especifico. Na primeira tentativa vieram 8 cookies, 6
     deles de analytics, e a sessao nao autenticou no servidor. */
  const chamar = (api, filtro) => new Promise((resolve) => {
    try {
      api.list(filtro, (cookies, erro) => resolve(erro ? [] : (cookies || [])));
    } catch (_) { resolve([]); }
  });

  const listarCookies = async () => {
    const api = (typeof GM_cookie !== 'undefined' && GM_cookie)
      || (typeof GM !== 'undefined' && GM.cookie);
    if (!api || !api.list) return null;
    const listas = await Promise.all([
      chamar(api, { url: 'https://www.bling.com.br/' }),
      chamar(api, { domain: 'www.bling.com.br' }),
      chamar(api, { domain: '.bling.com.br' }),
      chamar(api, { domain: 'bling.com.br' }),
    ]);
    // Junta tudo sem repetir nome (o mais especifico ganha por vir primeiro)
    const porNome = new Map();
    for (const lista of listas) {
      for (const c of lista) if (!porNome.has(c.name)) porNome.set(c.name, c);
    }
    return [...porNome.values()];
  };

  function aviso(texto, cor) {
    let el = document.getElementById('brave-hub-sessao');
    if (!el) {
      el = document.createElement('div');
      el.id = 'brave-hub-sessao';
      el.style.cssText = [
        'position:fixed', 'bottom:64px', 'left:14px', 'z-index:2147483646',
        'background:#1e293b', 'color:#e2e8f0', 'padding:8px 12px', 'border-radius:8px',
        'font:600 11px/1.3 system-ui,sans-serif', 'max-width:300px', 'opacity:.9',
        'pointer-events:none', 'box-shadow:0 4px 14px rgba(0,0,0,.3)',
      ].join(';');
      const st = document.createElement('style');
      st.textContent = '@media print { #brave-hub-sessao { display:none !important; } }';
      document.head.appendChild(st);
      document.body.appendChild(el);
    }
    el.textContent = texto;
    if (cor) el.style.background = cor;
    setTimeout(() => el.remove(), 8000);
  }

  async function enviarSessao() {
    const ultimo = Number(localStorage.getItem(CHAVE_ULTIMO) || 0);
    if (Date.now() - ultimo < INTERVALO_MIN_MS) return;

    const cookies = await listarCookies();
    if (!cookies || !cookies.length) {
      aviso('⚠️ Sessão: não consegui ler os cookies (permissão do Tampermonkey?)', '#7c2d12');
      return;
    }

    /* Os cookies sozinhos NAO autenticam: testado de outro IP, o Bling responde
       "Usuario nao autenticado", e na lista nao ha cookie de sessao (DVSID e
       identificador de dispositivo; o resto e analytics). Indicio de que a
       autenticacao vive em token no proprio navegador — por isso levamos
       tambem localStorage e sessionStorage. */
    const armazenamento = {};
    for (const [origem, store] of [['local', localStorage], ['session', sessionStorage]]) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        const v = store.getItem(k) || '';
        // so o que tem cara de credencial, e sem arrastar payload gigante
        if (/token|auth|session|jwt|bearer|acesso|login|user/i.test(k) && v.length < 4000) {
          armazenamento[`${origem}:${k}`] = v;
        }
      }
    }

    // Formato "nome=valor; nome=valor" — é o que o servidor injeta no navegador.
    const texto = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    try {
      const r = await fetch(`${HUB}/api/bling?acao=sessao_bling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-token': TOKEN },
        body: JSON.stringify({ cookies: texto, armazenamento }),
      });
      const j = await r.json();
      if (j.ok) {
        localStorage.setItem(CHAVE_ULTIMO, String(Date.now()));
        aviso(`🔑 Sessão enviada: ${j.itens} cookies + ${Object.keys(armazenamento).length} chaves de token`, '#14532d');
      } else {
        aviso(`⚠️ Sessão: ${j.error}`, '#7c2d12');
      }
    } catch (e) {
      aviso(`⚠️ Sessão: falha de rede — ${e.message}`, '#7c2d12');
    }
  }

  setTimeout(enviarSessao, 2500);
})();
