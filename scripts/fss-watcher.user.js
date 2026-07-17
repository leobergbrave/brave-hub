// ==UserScript==
// @name         Brave HUB — Watcher de Leads do Full Sales System
// @namespace    bravefitness.com.br
// @version      1.0.0
// @description  Le a lista de Contatos do FSS e manda os leads novos pra edge function webhook-fss.
// @match        https://app.fullsalessystem.com/v2/location/*/contacts/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Por que este script existe:
 * o plano do FSS nao libera Workflows nem Private Integrations, entao nao ha
 * webhook nativo nem API. A unica porta e a sessao ja logada do navegador.
 *
 * A lista de Contatos e uma tabela Tabulator. As celulas expoem `tabulator-field`
 * (name/phone/email/dateAdded/tags), o que da um contrato estavel pra leitura.
 *
 * Pegadinha importante: quando o contato tem mais tags do que cabe na celula, o
 * Tabulator mostra "+N" e ESCONDE o resto do texto. As tags escondidas so existem
 * no atributo `tooltip` do chip "+N". Ler so o innerText perde tag de produto e o
 * lead nunca dispara. Ver lerTags().
 *
 * Quem decide o que fazer com o lead e o servidor (webhook-fss), nao este script:
 * ele so reporta o que viu. Toda a idempotencia vive la.
 *
 * Por que tem painel na pagina em vez de so console.log: o FSS injeta `debugger`
 * em loop pra travar quem abre o DevTools (bundle-v3.js ofuscado). Acompanhar este
 * script pelo console significa brigar com essa armadilha toda vez. O painel mostra
 * o estado sem precisar de F12.
 */

(function () {
  'use strict';

  const CONFIG = {
    endpoint: 'https://jisbvqrnnujqgbsfondy.supabase.co/functions/v1/webhook-fss',
    segredo: '',            // = FSS_WEBHOOK_SECRET nos secrets do Supabase
    intervaloMs: 5 * 60 * 1000,

    // MODO DE TESTE. Em true nao grava nem dispara nada: so mostra no console o
    // que faria. So vire false depois de conferir a tabela do dry-run.
    dryRun: true,

    // Trava de seguranca: ignora contato criado ANTES deste instante. Sem isso,
    // o primeiro ciclo varreria os 58 contatos historicos e dispararia WhatsApp
    // pra clientes antigos e pra quem ja comprou. Formato ISO.
    criadoDepoisDe: '2026-07-17T00:00:00-03:00',
  };

  const CHAVE_CACHE = 'brave_fss_watcher_enviados';
  const corte = new Date(CONFIG.criadoDepoisDe).getTime();

  // ── Painel na pagina ────────────────────────────────────────────────
  // O SPA remonta o DOM ao trocar de rota, entao o painel e reinjetado a cada
  // ciclo se tiver sumido (ver garantirPainel).
  const ID_PAINEL = 'brave-fss-watcher';

  // Map em vez de array: em dry-run o cache nao e gravado (de proposito, pra o teste
  // poder repetir), entao o mesmo lead e reenviado a cada ciclo. Com array o painel
  // enchia de linhas iguais e escondia os outros leads. Chaveado por telefone, cada
  // lead ocupa uma linha e a ultima leitura sobrescreve a anterior.
  const historico = new Map();

  function garantirPainel() {
    let el = document.getElementById(ID_PAINEL);
    if (el) return el;

    el = document.createElement('div');
    el.id = ID_PAINEL;
    el.style.cssText = [
      'position:fixed', 'bottom:12px', 'right:12px', 'z-index:2147483647',
      'font:12px/1.4 -apple-system,Segoe UI,sans-serif', 'color:#e4e4e7',
      'background:#18181b', 'border:1px solid #3f3f46', 'border-radius:8px',
      'box-shadow:0 4px 16px rgba(0,0,0,.4)', 'max-width:340px', 'overflow:hidden',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function pintarPainel(resumo) {
    const el = garantirPainel();
    const cor = CONFIG.dryRun ? '#facc15' : '#4ade80';
    const rotulo = CONFIG.dryRun ? 'DRY-RUN (nao grava)' : 'ATIVO';

    const linhas = [...historico.values()].slice(-8).reverse().map((h) => {
      const cores = {
        criar_e_disparar:   '#4ade80', // lead novo, cadastrado e disparado
        disparar_existente: '#4ade80', // ja estava na base como 'novo', disparou agora
        ignorado:           '#a1a1aa', // ja tinha sido processado antes
        cadastrado_sem_disparo: '#facc15',
        disparo_falhou:     '#f87171',
        erro:               '#f87171',
      };
      return `<div style="display:flex;gap:6px;padding:3px 0;border-top:1px solid #27272a">
        <span style="color:${cores[h.acao] || '#a1a1aa'};white-space:nowrap">${h.acao}</span>
        <span style="color:#e4e4e7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${h.nome}</span>
        <span style="color:#71717a;margin-left:auto;white-space:nowrap">${h.detalhe}</span>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div style="padding:8px 10px;background:#09090b;display:flex;align-items:center;gap:6px">
        <span style="width:7px;height:7px;border-radius:50%;background:${cor};flex:none"></span>
        <b style="color:#fff">fss-watcher</b>
        <span style="color:${cor};font-size:10px;letter-spacing:.5px">${rotulo}</span>
      </div>
      <div style="padding:8px 10px;color:#a1a1aa">
        ${resumo}
        ${linhas ? `<div style="margin-top:6px">${linhas}</div>` : ''}
      </div>`;
  }

  // cache: assinatura (telefone|tags) -> true. A assinatura inclui as tags de
  // proposito: quando a IA promove o lead de atendimento_ia pra "bike erg", a
  // assinatura muda e o lead e reenviado pro servidor decidir a promocao.
  const lerCache = () => {
    try { return JSON.parse(localStorage.getItem(CHAVE_CACHE) || '{}'); }
    catch { return {}; }
  };
  const gravarCache = (c) => localStorage.setItem(CHAVE_CACHE, JSON.stringify(c));

  function lerTags(celula) {
    if (!celula) return [];
    const tags = new Set();

    // chips visiveis (o "+N" nao e tag, e contador)
    for (const linha of (celula.innerText || '').split('\n')) {
      const t = linha.trim();
      if (t && !/^\+\d+$/.test(t)) tags.add(t.toLowerCase());
    }
    // tags escondidas atras do "+N"
    for (const el of celula.querySelectorAll('[tooltip]')) {
      const attr = el.getAttribute('tooltip');
      if (!attr || attr === 'null') continue;
      for (const parte of attr.split(/[,\n]/)) {
        const t = parte.trim();
        if (t && !/^\+\d+$/.test(t)) tags.add(t.toLowerCase());
      }
    }
    return [...tags];
  }

  function lerLinhas() {
    return [...document.querySelectorAll('.tabulator-row')].map((linha) => {
      const campo = (f) => linha.querySelector(`[tabulator-field="${f}"]`);
      const txt = (f) => (campo(f)?.innerText || '').trim();

      // Todas as celulas usam \n como separador interno — nunca espaco.
      // nome:     "RR\nRafaela Romanelli"            (iniciais do avatar + nome)
      // telefone: "(67) 99667-7970\n(67) 99667-7970" (numero repetido)
      // criado:   "Jul 16, 2026\n03:29 PM"
      // Cuidado: o numero tem espaco dentro dele, entao cortar por espaco
      // devolve so o DDD.
      const nome = txt('name').split('\n').pop().trim();
      const telefone = txt('phone').split('\n')[0].trim();

      return {
        nome,
        telefone,
        email: txt('email').split('\n')[0].trim() || null,
        criadoTexto: txt('dateAdded').replace(/\s+/g, ' '),
        tags: lerTags(campo('tags')),
      };
    }).filter((l) => l.nome && l.telefone);
  }

  async function enviar(lead) {
    const res = await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-fss-secret': CONFIG.segredo },
      body: JSON.stringify({ ...lead, dryRun: CONFIG.dryRun }),
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${JSON.stringify(corpo)}`);
    return corpo;
  }

  const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  async function ciclo() {
    const linhas = lerLinhas();
    if (!linhas.length) {
      // Acontece: a lista e populada via Firebase e as vezes a tela fica em branco
      // (FirebaseError: Missing or insufficient permissions). Nao e fatal — o
      // proximo ciclo tenta de novo.
      pintarPainel(`<b style="color:#f87171">lista vazia na tela</b><br>${hora()} · nada lido, tenta de novo em 5min`);
      return;
    }

    const cache = lerCache();
    let enviados = 0, pulados = 0;

    for (const linha of linhas) {
      const quando = Date.parse(linha.criadoTexto);
      if (Number.isNaN(quando)) {
        historico.set(linha.telefone, { acao: 'erro', nome: linha.nome, detalhe: 'data ilegivel' });
        continue;
      }
      if (quando < corte) { pulados++; continue; } // historico: nunca tocar

      const assinatura = `${linha.telefone}|${[...linha.tags].sort().join(',')}`;
      if (cache[assinatura]) { pulados++; continue; }

      try {
        const r = await enviar({
          nome: linha.nome,
          telefone: linha.telefone,
          email: linha.email,
          tags: linha.tags,
        });
        enviados++;
        historico.set(linha.telefone, {
          acao: r.acao || 'erro',
          nome: linha.nome,
          detalhe: (r.produtos && r.produtos.length) ? r.produtos.join(',') : (r.motivo || 'sem equipamento'),
        });
        // No dry-run nao marca o cache, senao o teste so rodaria uma vez.
        if (!CONFIG.dryRun) { cache[assinatura] = true; gravarCache(cache); }
      } catch (err) {
        historico.set(linha.telefone, { acao: 'erro', nome: linha.nome, detalhe: String(err.message || err).slice(0, 40) });
      }
    }
    pintarPainel(
      `${hora()} · ${linhas.length} na tela · <b style="color:#e4e4e7">${enviados}</b> enviado(s) · ${pulados} ignorado(s)` +
      `<br><span style="color:#52525b">corte: ${CONFIG.criadoDepoisDe.slice(0, 10)}</span>`
    );
  }

  pintarPainel('iniciando… primeira varredura em 8s');
  setTimeout(ciclo, 8000); // deixa o Tabulator terminar de montar
  setInterval(ciclo, CONFIG.intervaloMs);
})();
