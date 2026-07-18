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
    horasRelatorio: [8, 14],               // relatorio 24h (follow-up) roda nessas horas
    // MODO DE TESTE: nao dispara pro BotConversa, so mostra no painel o que faria.
    dryRun: true,
  };

  const CHAVE = 'brave_fss_vigia_alertados'; // { telefone: timestampUltimoAlerta }

  // ── Interpretacao de tags -> interesse ───────────────────────────────
  // Mapa determinístico (fonte: catalogo Brave / webhook-fss). Traduz as tags do
  // lead no que ele quer comprar. O alerta leva a leitura + as tags cruas.
  const EQUIP = {
    'bike erg': 'Bike Erg', 'bikeerg': 'Bike Erg',
    'remo': 'Remo Indoor',
    'ski': 'Ski Erg', 'ski erg': 'Ski Erg', 'skierg': 'Ski Erg',
    'storm bike': 'Storm Bike', 'storm': 'Storm Bike',
    'esteira curva': 'Esteira Curva', 'esteira': 'Esteira Curva',
    'escada': 'Escada',
  };
  const COMBO = ['box completo', 'combo ergometros', 'combo ergômetros'];
  const PROJETO = {
    'academia': 'montar/complementar academia',
    'academia / crossfit': 'academia + CrossFit',
    'crossfit': 'box de CrossFit', 'cross': 'box de CrossFit',
    'crossfit / academia': 'CrossFit + academia',
    'hyrox': 'treino Hyrox', 'crossfit hyrox': 'CrossFit + Hyrox', 'crossfit/hyrox': 'CrossFit + Hyrox',
    'box_hibrido': 'box híbrido', 'home box': 'home box (casa)',
    'studio funcional': 'estúdio funcional', 'uso pessoal': 'uso pessoal',
  };
  const QUENTES = ['quente', 'superquente'];

  function interpretarTags(tagsStr) {
    const tags = String(tagsStr || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    const equip = new Set(), proj = new Set();
    let combo = false, quente = false, turma = '';
    for (const t of tags) {
      if (EQUIP[t]) equip.add(EQUIP[t]);
      if (COMBO.includes(t)) combo = true;
      if (PROJETO[t]) proj.add(PROJETO[t]);
      if (QUENTES.includes(t)) quente = true;
      const m = t.match(/(\d+)_alunos/); // boxcross_20_alunos / hibrido_25_alunos
      if (m) turma = `~${m[1]} alunos`;
    }
    const partes = [];
    if (combo) partes.push('Box completo (todos os ergômetros)');
    else if (equip.size) partes.push([...equip].join(', '));
    if (proj.size) partes.push([...proj].join(' / '));
    if (turma) partes.push('porte ' + turma);
    let txt = partes.join(' · ') || 'a definir (ainda em qualificação)';
    if (quente) txt = '🔥 ' + txt;
    return txt;
  }

  // ── Filtro de ruido nas tags ─────────────────────────────────────────
  // Esconde tags de origem/campanha/sistema; deixa so o que ajuda a decidir.
  const RUIDO = [
    /^rd-station$/, /^base[_ ]/, /^lead$/, /^consentimento$/, /^interesse-publico$/,
    /^d1$/, /black/, /^lp /, /202\d/, /^disparo/, /^oferta/, /^ofertaesteira/,
    /resposta/, /^respondeu/, /^naorespondeu/, /^nao_respondeu/, /socialselling/,
    /^externo[_ ]/, /^tag-trigger$/, /^prevendas$/, /^recusado$/, /^agendamento$/,
    /garantia/, /^suporte/, /^d\d+$/,
  ];
  const ehRuido = (t) => RUIDO.some((re) => re.test(t));
  function filtrarTags(tagsStr) {
    const uteis = String(tagsStr || '').split(',').map((t) => t.trim()).filter(Boolean)
      .filter((t) => !ehRuido(t.toLowerCase()));
    return uteis.join(', ');
  }

  // ── Prioridade: quente primeiro, depois quem espera ha mais tempo ─────
  function parseTempo(str) {
    const s = String(str || '').toLowerCase();
    let min = 0;
    const dias = s.match(/(\d+)\s*d(ia)?/); if (dias) min += (+dias[1]) * 1440;
    const h = s.match(/(\d+)\s*h/); if (h) min += (+h[1]) * 60;
    const m = s.match(/(\d+)\s*min/); if (m) min += (+m[1]);
    return min;
  }
  const ehQuente = (tags) => QUENTES.some((q) => String(tags || '').toLowerCase().includes(q));
  function ordenarPorPrioridade(pend) {
    return pend.slice().sort((a, b) => {
      const qa = ehQuente(a.tags) ? 1 : 0, qb = ehQuente(b.tags) ? 1 : 0;
      if (qa !== qb) return qb - qa;                 // quente primeiro
      return parseTempo(b.tempo) - parseTempo(a.tempo); // depois: espera mais longa
    });
  }

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
    'EXATO: NOME | TELEFONE | HA QUANTO TEMPO | ULTIMA MENSAGEM DO CLIENTE | TAGS. ' +
    'Na ULTIMA MENSAGEM, coloque o texto que o cliente mandou (resuma se for muito longo). ' +
    'Se nao houver nenhum, responda exatamente: NENHUM. ' + MARCADOR;

  // Relatorio 24h (follow-up do pessoal): quem recebeu a 1a msg e sumiu. Query pesada.
  const PERGUNTA_24H =
    'Liste os contatos que receberam a NOSSA primeira mensagem ha mais de 24 horas e ' +
    'ainda NAO responderam nada depois disso. Uma linha por contato, no formato EXATO: ' +
    'NOME | TELEFONE | HA QUANTO TEMPO FOI ENVIADA | TAGS. ' +
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

  async function perguntar(texto, maxSeg = 60) {
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

    // espera comecar a gerar e depois terminar (ate maxSeg), com texto estavel
    await espera(1500);
    let estavel = 0, ultimoTam = -1;
    for (let i = 0; i < maxSeg; i++) {
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
  // Aceita 4 campos (NOME|TEL|TEMPO|TAGS, usado no relatorio 24h) ou 5 (com a ULTIMA
  // MENSAGEM no meio, usado no vigia). Detecta pelo numero de partes.
  function parsePendentes(bruto) {
    const pend = [];
    for (const raw of bruto.split('\n')) {
      const l = raw.replace(/^[#\-*\s]+/, '').trim();
      if (!l.includes('|')) continue;
      const partes = l.split('|').map((p) => p.trim());
      if (partes.length < 2) continue;
      const telefone = (partes[1] || '').replace(/\D/g, '');
      if (telefone.length < 10) continue; // sem telefone valido -> nao e um lead
      let ultimaMsg = '', tags = '';
      if (partes.length >= 5) { ultimaMsg = partes[3]; tags = partes[4]; }
      else { tags = partes[3] || ''; }
      pend.push({ nome: partes[0] || '?', telefone, tempo: partes[2] || '', ultimaMsg, tags });
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

    // Dedup por telefone -> { msg: ultima msg avisada, ts: quando }. Avisa quando:
    //  - o telefone e novo, OU
    //  - a ultima mensagem MUDOU (mensagem nova do cliente), OU
    //  - ja faz mais de 3h que avisei (lembrete de quem segue esperando).
    const mapa = lerMapa();
    const chave = (p) => normMsg(p.ultimaMsg);
    const novos = pendentes.filter((p) => {
      const reg = mapa[p.telefone];
      return !reg || reg.msg !== chave(p) || (agora() - reg.ts) > CONFIG.reavisarAposMs;
    });

    pintar(`${pendentes.length} pendente(s) · ${novos.length} pra avisar`, pendentes);

    // Dry-run: so mostra no painel, nao grava nem envia. Assim, ao virar pra live, os
    // pendentes atuais ainda geram alerta (o mapa comeca limpo).
    if (CONFIG.dryRun || !novos.length) return;

    // limpa do mapa quem nao esta mais pendente (evita crescer pra sempre)
    const telsAtuais = new Set(pendentes.map((p) => p.telefone));
    for (const tel of Object.keys(mapa)) if (!telsAtuais.has(tel)) delete mapa[tel];

    const ok = await dispararAlerta(novos);
    if (ok) { for (const p of novos) mapa[p.telefone] = { msg: chave(p), ts: agora() }; gravarMapa(mapa); }
  }

  // normaliza a ultima mensagem pra comparacao estavel (a IA pode variar espacos/caixa)
  const normMsg = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 60);

  async function dispararAlerta(novos) {
    const ord = ordenarPorPrioridade(novos);
    const linhas = ord.map((p, i) => {
      const tagsUteis = filtrarTags(p.tags);
      const msg = String(p.ultimaMsg || '').replace(/\s+/g, ' ').trim().slice(0, 90);
      return `${i + 1}) ${ehQuente(p.tags) ? '🔥 ' : ''}${p.nome} — ${p.tempo}` +
        (msg ? `\n   💬 "${msg}"` : '') +
        `\n   💡 ${interpretarTags(p.tags)}` +
        (tagsUteis ? `\n   🏷️ ${tagsUteis}` : '');
    }).join('\n\n');
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
    const lista = ordenarPorPrioridade(pendentes || []).slice(0, 6).map((p) => `<div style="padding:3px 0;border-top:1px solid #27272a;overflow:hidden"><div style="white-space:nowrap;text-overflow:ellipsis;overflow:hidden">${ehQuente(p.tags) ? '🔥 ' : ''}${p.nome} · <span style="color:#71717a">${p.tempo}</span></div><div style="color:#a1a1aa;font-size:11px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden">💡 ${interpretarTags(p.tags)}</div></div>`).join('');
    el.innerHTML =
      `<div style="padding:8px 10px;background:#09090b;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:50%;background:${cor};flex:none"></span><b style="color:#fff">vigia de leads</b><span style="color:${cor};font-size:10px">${CONFIG.dryRun ? 'DRY-RUN' : 'ATIVO'}</span></div>` +
      `<div style="padding:8px 10px;color:#a1a1aa">${hora()} · ${status}${lista ? `<div style="margin-top:4px">${lista}</div>` : ''}</div>`;
  }

  // ── Relatorio 24h (follow-up pro pessoal) ────────────────────────────
  // Query pesada (varre conversa por conversa), roda so 1-2x/dia. Reusa a Ask AI e
  // o mesmo webhook, mas com titulo diferente pra o Leo saber que e o follow-up.
  const CHAVE_REL = 'brave_fss_vigia_relatorio'; // "YYYY-MM-DD-H" do ultimo envio
  const slotHoje = (h) => `${new Date().toISOString().slice(0, 10)}-${h}`;

  async function relatorio24h() {
    let bruto;
    try { bruto = await perguntar(PERGUNTA_24H, 180); } // ate 3 min: e lenta
    catch (e) { console.warn('[vigia] relatorio 24h falhou:', e.message); return; }
    const lista = parsePendentes(bruto);
    if (lista === null) { console.warn('[vigia] relatorio 24h: formato inesperado'); return; }

    if (!CONFIG.dryRun) {
      const ord = ordenarPorPrioridade(lista);
      const corpo = lista.length
        ? ord.map((p, i) => `${i + 1}) ${p.nome} — ${p.tempo}\n   💡 ${interpretarTags(p.tags)}` + (filtrarTags(p.tags) ? `\n   🏷️ ${filtrarTags(p.tags)}` : '')).join('\n\n')
        : 'Ninguém sem resposta há +24h agora. 👍';
      const texto = `📋 FOLLOW-UP (24h sem resposta) — pro time contatar:\n\n${corpo}`;
      await fetch(CONFIG.webhook, {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ telefone: CONFIG.telefoneAlerta, nome: 'Leo Berg', titulo: 'Follow-up 24h', qtd_pendentes: String(lista.length), alerta: texto }),
      }).catch((e) => console.error('[vigia] envio relatorio falhou:', e));
    } else {
      console.log(`[vigia] DRY-RUN relatorio 24h: ${lista.length} contato(s)`, lista);
    }
  }

  // ── Agendador unico com trava (vigia e relatorio nao colidem na Ask AI) ─
  let ocupado = false;
  async function tick() {
    if (ocupado) return; // uma pergunta por vez
    ocupado = true;
    try {
      const h = new Date().getHours();
      // relatorio 24h: nas horas configuradas, uma vez por slot
      if (CONFIG.horasRelatorio.includes(h)) {
        const rel = lerRel();
        if (rel !== slotHoje(h)) { await relatorio24h(); localStorage.setItem(CHAVE_REL, slotHoje(h)); }
      }
      await ciclo();
    } finally { ocupado = false; }
  }
  const lerRel = () => localStorage.getItem(CHAVE_REL) || '';

  pintar('iniciando… primeira checagem em 10s', []);
  setTimeout(tick, 10000);
  setInterval(tick, CONFIG.intervaloMs);
})();
