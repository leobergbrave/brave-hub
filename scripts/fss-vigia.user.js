// ==UserScript==
// @name         Brave HUB — Vigia de Leads (FSS)
// @namespace    bravefitness.com.br
// @version      0.1.0
// @description  Pergunta à IA nativa do FSS quais atendimentos estão esperando resposta e avisa no WhatsApp pessoal via BotConversa.
// @match        https://app.fullsalessystem.com/v2/location/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Por que este script existe:
 * o FSS esta todo trancado pela agencia (sem API, sem Workflows). A unica coisa
 * que funciona e a "Pergunte à IA" nativa — um <textarea> onde da pra perguntar em
 * texto e ler a resposta. Provado em 18/07/2026 que ela lista atendimentos pendentes.
 *
 * Este vigia, a cada 15 min:
 *   1. abre a "Pergunte à IA"
 *   2. pergunta quais atendimentos estao esperando NOSSA resposta, pedindo um
 *      formato fixo (linhas comecando com ###) pra dar pra ler por codigo
 *   3. faz dedup por telefone (so avisa lead novo; re-lembra se continuar parado)
 *   4. dispara pro webhook do BotConversa, que manda no WhatsApp pessoal do Leo
 *
 * NAO responde cliente. So avisa o Leo pra ele responder pelo app do FSS (que tem
 * a IA com aprovacao embutida). Ver memoria project_fss_ia_nativa.
 *
 * v0.1 — primeira versao, precisa de rodada de ajuste ao vivo (seletores da Ask AI,
 * tempo de geracao, parsing). O painel no canto mostra o que esta acontecendo.
 */

(function () {
  'use strict';

  const CONFIG = {
    webhook: 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/192554/CktY3Mq5Wxo8/',
    telefoneAlerta: '5548996459791',      // WhatsApp pessoal do Leo (fixo)
    intervaloMs: 15 * 60 * 1000,          // 15 min
    reavisarAposMs: 3 * 60 * 60 * 1000,   // re-lembra um pendente que continua parado apos 3h
    horaInicio: 8,                         // so roda em horario comercial (8h-20h)
    horaFim: 20,
    // MODO DE TESTE: nao dispara pro BotConversa, so mostra no painel o que faria.
    dryRun: true,
  };

  const CHAVE = 'brave_fss_vigia_alertados'; // { telefone: timestampUltimoAlerta }

  const lerMapa = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || '{}'); } catch { return {}; } };
  const gravarMapa = (m) => localStorage.setItem(CHAVE, JSON.stringify(m));
  const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const agora = () => Date.now();

  // ── Pergunta fixa ────────────────────────────────────────────────────
  // Nota: a IA obedece o formato de pipes mas costuma ignorar o prefixo ###,
  // entao o parser NAO depende dele (parseia qualquer linha com telefone valido).
  // MARCADOR e a ultima frase da pergunta — usado pra isolar so a resposta nova,
  // porque o painel da Ask AI acumula todo o historico da conversa.
  const MARCADOR = 'Nao escreva mais nada.';
  const PERGUNTA =
    'Liste os atendimentos que estao esperando NOSSA resposta agora (o cliente ' +
    'enviou mensagem e ainda nao respondemos). Uma linha por atendimento, no formato ' +
    'EXATO: NOME | TELEFONE | HA QUANTO TEMPO | TAGS. ' +
    'Se nao houver nenhum, responda exatamente: NENHUM. ' + MARCADOR;

  // ── Driver da "Pergunte à IA" ────────────────────────────────────────
  function abrirAskAI() {
    let ta = acharTextarea();
    if (ta) return ta;
    const btn = [...document.querySelectorAll('button,[role="button"]')]
      .find((b) => /Pergunte à AI|Ask AI|Assistente de AI/i.test((b.innerText || '') + (b.getAttribute('aria-label') || '')));
    if (btn) btn.click();
    return null; // caller espera e tenta de novo
  }

  const acharTextarea = () =>
    [...document.querySelectorAll('textarea')].find((e) => /pergunte qualquer coisa/i.test(e.getAttribute('placeholder') || ''));

  const estaGerando = () => !!document.querySelector('.askai-send-btn__stop');

  function lerRespostaBruta() {
    const painel = [...document.querySelectorAll('[class*="askai"],[class*="ask-ai"],[class*="ai-chat"],[class*="assistant"]')]
      .filter((e) => e.offsetHeight > 0)
      .sort((a, b) => b.innerText.length - a.innerText.length)[0];
    return painel ? painel.innerText : '';
  }

  const espera = (ms) => new Promise((r) => setTimeout(r, ms));

  async function perguntar(texto) {
    // abre o painel (pode precisar de 2 tentativas)
    let ta = abrirAskAI();
    for (let i = 0; !ta && i < 6; i++) { await espera(700); ta = acharTextarea(); }
    if (!ta) throw new Error('Ask AI nao abriu');

    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, texto);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    await espera(300);
    for (const t of ['keydown', 'keypress', 'keyup'])
      ta.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));

    // espera comecar a gerar (ate 8s) e depois terminar (ate 60s), com texto estavel
    await espera(1500);
    let estavel = 0, ultimoTam = -1;
    for (let i = 0; i < 60; i++) {
      const tam = lerRespostaBruta().length;
      if (!estaGerando() && tam === ultimoTam) { if (++estavel >= 2) break; }
      else estavel = 0;
      ultimoTam = tam;
      await espera(1000);
    }
    // Isola so a resposta mais recente: o painel acumula historico, e a pergunta
    // e ecoada; corta tudo ate o fim da ultima ocorrencia do MARCADOR.
    const bruto = lerRespostaBruta();
    const i = bruto.lastIndexOf(MARCADOR);
    return i >= 0 ? bruto.slice(i + MARCADOR.length) : bruto;
  }

  // ── Parsing ──────────────────────────────────────────────────────────
  // A IA responde "Nome | Telefone | Tempo | Tags" (as vezes sem o ###). Parseia
  // qualquer linha que tenha pipe + um telefone de verdade. Ignora a linha da
  // propria pergunta (onde partes[1] e a palavra "TELEFONE", sem digitos).
  function parsePendentes(bruto) {
    const pend = [];
    for (const raw of bruto.split('\n')) {
      const l = raw.replace(/^[#\-*\s]+/, '').trim();
      if (!l.includes('|')) continue;
      const partes = l.split('|').map((p) => p.trim());
      if (partes.length < 2) continue;
      const telefone = (partes[1] || '').replace(/\D/g, '');
      if (telefone.length < 10) continue; // sem telefone valido -> nao e um lead
      pend.push({ nome: partes[0] || '?', telefone, tempo: partes[2] || '', tags: partes[3] || '' });
    }
    if (pend.length) return pend;
    if (/\bNENHUM\b|nao ha atendimento|sem pendent|nenhum atendimento/i.test(bruto)) return [];
    return null; // incerto — nao dispara, so loga
  }

  // ── Ciclo ────────────────────────────────────────────────────────────
  async function ciclo() {
    const h = new Date().getHours();
    if (h < CONFIG.horaInicio || h >= CONFIG.horaFim) { pintar('fora do horario comercial', []); return; }

    let bruto;
    try { bruto = await perguntar(PERGUNTA); }
    catch (e) { pintar('erro ao perguntar: ' + e.message, []); return; }

    const pendentes = parsePendentes(bruto);
    if (pendentes === null) { pintar('resposta em formato inesperado (ver console)', []); console.warn('[vigia] bruto:', bruto.slice(-800)); return; }

    const mapa = lerMapa();
    const novos = pendentes.filter((p) => {
      const ultimo = mapa[p.telefone];
      return !ultimo || (agora() - ultimo) > CONFIG.reavisarAposMs;
    });

    // limpa do mapa quem nao esta mais pendente
    const telsAtuais = new Set(pendentes.map((p) => p.telefone));
    for (const tel of Object.keys(mapa)) if (!telsAtuais.has(tel)) delete mapa[tel];

    pintar(`${pendentes.length} pendente(s) · ${novos.length} pra avisar`, pendentes);

    if (!novos.length) return;

    if (!CONFIG.dryRun) {
      const ok = await dispararAlerta(novos);
      if (ok) { for (const p of novos) mapa[p.telefone] = agora(); gravarMapa(mapa); }
    } else {
      for (const p of novos) mapa[p.telefone] = agora(); // no dry-run marca localmente pra nao repetir
      gravarMapa(mapa);
    }
  }

  async function dispararAlerta(novos) {
    const linhas = novos.map((p, i) => `${i + 1}) ${p.nome} - ${p.tempo}${p.tags ? ' - ' + p.tags : ''}`).join('\n');
    const texto = `🔔 ${novos.length} atendimento(s) esperando resposta:\n\n${linhas}\n\nResponda pelo app do FSS (Pergunte à IA).`;
    try {
      const res = await fetch(CONFIG.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          telefone: CONFIG.telefoneAlerta,
          nome: 'Leo Berg',
          titulo: 'Leads aguardando resposta',
          qtd_pendentes: String(novos.length),
          alerta: texto,
        }),
      });
      return res.ok;
    } catch (e) { console.error('[vigia] falha ao disparar:', e); return false; }
  }

  // ── Painel ───────────────────────────────────────────────────────────
  const ID = 'brave-fss-vigia';
  function pintar(status, pendentes) {
    let el = document.getElementById(ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ID;
      el.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:2147483647;font:12px/1.4 -apple-system,Segoe UI,sans-serif;color:#e4e4e7;background:#18181b;border:1px solid #3f3f46;border-radius:8px;box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:320px;overflow:hidden';
      document.body.appendChild(el);
    }
    const cor = CONFIG.dryRun ? '#facc15' : '#4ade80';
    const lista = (pendentes || []).slice(0, 6).map((p) => `<div style="padding:2px 0;border-top:1px solid #27272a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.nome} · <span style="color:#71717a">${p.tempo}</span></div>`).join('');
    el.innerHTML =
      `<div style="padding:8px 10px;background:#09090b;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:${cor};flex:none"></span><b style="color:#fff">vigia de leads</b><span style="color:${cor};font-size:10px">${CONFIG.dryRun ? 'DRY-RUN' : 'ATIVO'}</span></div>` +
      `<div style="padding:8px 10px;color:#a1a1aa">${hora()} · ${status}${lista ? `<div style="margin-top:4px">${lista}</div>` : ''}</div>`;
  }

  pintar('iniciando… primeira checagem em 10s', []);
  setTimeout(ciclo, 10000);
  setInterval(ciclo, CONFIG.intervaloMs);
})();
