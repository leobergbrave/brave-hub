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

  async function ciclo() {
    const linhas = lerLinhas();
    if (!linhas.length) {
      // Acontece: a lista e populada via Firebase e as vezes a aba fica em branco.
      // Nao e erro fatal — o proximo ciclo tenta de novo.
      console.warn('[fss-watcher] nenhuma linha na tela; pulando ciclo');
      return;
    }

    const cache = lerCache();
    const resultados = [];

    for (const linha of linhas) {
      const quando = Date.parse(linha.criadoTexto);
      if (Number.isNaN(quando)) {
        console.warn('[fss-watcher] data ilegivel, ignorando por seguranca:', linha.nome, linha.criadoTexto);
        continue;
      }
      if (quando < corte) continue; // historico: nunca tocar

      const assinatura = `${linha.telefone}|${[...linha.tags].sort().join(',')}`;
      if (cache[assinatura]) continue;

      try {
        const r = await enviar({
          nome: linha.nome,
          telefone: linha.telefone,
          email: linha.email,
          tags: linha.tags,
        });
        resultados.push({ nome: linha.nome, tags: linha.tags.join(', '), ...r });
        // No dry-run nao marca o cache, senao o teste so funcionaria uma vez.
        if (!CONFIG.dryRun) { cache[assinatura] = true; gravarCache(cache); }
      } catch (err) {
        console.error('[fss-watcher] falhou em', linha.nome, err);
      }
    }

    if (resultados.length) {
      console.log(`[fss-watcher] ${CONFIG.dryRun ? 'DRY-RUN — nada foi gravado' : 'enviados'}:`);
      console.table(resultados);
    } else {
      console.log('[fss-watcher] nada novo');
    }
  }

  console.log(
    `[fss-watcher] ativo | dryRun=${CONFIG.dryRun} | ignora contatos criados antes de ${CONFIG.criadoDepoisDe}`
  );
  setTimeout(ciclo, 8000); // deixa o Tabulator terminar de montar
  setInterval(ciclo, CONFIG.intervaloMs);
})();
