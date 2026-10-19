// ==UserScript==
// @name         Brave HUB — Proposta no FSS
// @namespace    bravefitness.com.br
// @version      3.25
// @description  Painel BRAVE no FSS e no WhatsApp Web: propostas, vídeos de produtos com texto pronto, mensagens rápidas, qualificação do cliente e cadastro pré-preenchido.
// @match        https://app.fullsalessystem.com/v2/location/*
// @match        https://web.whatsapp.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @connect      brave-hub-two.vercel.app
// @connect      jisbvqrnnujqgbsfondy.supabase.co
// ==/UserScript==

/*
 * Por que existe: o cliente que veio do FSS responde no chat do FSS, que tem
 * numero proprio — o envio pelo BotConversa cairia em outra conversa. Antes o
 * Leo baixava o PDF no computador ou no celular so para reanexar aqui.
 *
 * Como anexa sem baixar: busca o PDF do HUB por fetch, monta um File em memoria
 * e entrega ao campo de anexo do chat (DataTransfer). Se a tela nao tiver um
 * input de arquivo alcancavel, cai para um evento de colar (paste), que os
 * editores de mensagem costumam aceitar.
 *
 * Nao use console.log para depurar: o FSS injeta `debugger` em loop para travar
 * quem abre o DevTools. Por isso o proprio painel mostra o estado.
 */

(function () {
  'use strict';

  const HUB = 'https://brave-hub-two.vercel.app';
  const VERSAO = '3.25'; // aparece no painel — confirma qual versao esta instalada
  const ID = 'brave-hub-proposta';
  let ultimoTelefone = null;
  let dados = null;
  let ultimoNomeAchado = null; // preenchido pela Abertura, mostrado no status

  /* O mesmo painel atende dois territorios: o chat do FSS e o WhatsApp Web
     (conversas do numero BRAVE). No WhatsApp nao ha formulario de contato nem
     campo de anexo alcancavel — la o telefone sai do cabecalho da conversa,
     texto entra por evento de colar (o editor Lexical ignora insertText com
     quebra de linha) e envios com arquivo vao pelo SERVIDOR (BotConversa),
     caindo na propria conversa aberta. */
  const WA = location.hostname === 'web.whatsapp.com';

  /* O CSP do WhatsApp Web bloqueia fetch da pagina para fora (connect-src) —
     toda conversa com o HUB e com o bucket de videos passa pelo canal
     privilegiado do Tampermonkey (GM_xmlhttpRequest + @connect), que ignora o
     CSP. Sem GM (ex.: rodando no FSS antigo), cai no fetch normal. */
  function hubFetch(url, opts = {}) {
    if (typeof GM_xmlhttpRequest === 'undefined') return fetch(url, opts);
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: opts.method || 'GET',
        url,
        headers: opts.headers || {},
        data: opts.body,
        responseType: 'blob',
        timeout: 60_000,
        onload: (r) => {
          /* Com responseType:'blob', r.response normalmente e um Blob (tem
             .text()). Mas em alguns casos o GM entrega o corpo como string (em
             r.responseText ou no proprio r.response) — ai Blob.text() nao existe
             e dava "r.response.text is not a function". Lemos de forma tolerante. */
          const lerTexto = async () => {
            if (r.response && typeof r.response.text === 'function') return await r.response.text();
            if (typeof r.responseText === 'string' && r.responseText.length) return r.responseText;
            if (typeof r.response === 'string') return r.response;
            return '';
          };
          resolve({
            ok: r.status >= 200 && r.status < 300,
            status: r.status,
            blob: async () => r.response,
            text: lerTexto,
            json: async () => JSON.parse(await lerTexto()),
          });
        },
        onerror: () => reject(new Error('falha de rede')),
        ontimeout: () => reject(new Error('tempo esgotado')),
      });
    });
  }

  /* Nome do contato salvo no cabecalho do WhatsApp; numero cru vira null. */
  function nomeContatoWA() {
    const t = (document.querySelector('#main header span[dir="auto"]')?.textContent || '').trim();
    if (!t || (t.match(/\d/g) || []).length >= 3) return null;
    return t;
  }

  /* O painel de contato do FSS mostra mais de um telefone (principal e
     adicional), e nem sempre o cadastrado no HUB e o primeiro. Em vez de
     adivinhar, juntamos todos os candidatos da tela e perguntamos ao HUB por
     cada um ate achar. */
  function acharTelefones() {
    if (WA) {
      /* No WhatsApp o numero da conversa aparece no aria-label do campo de
         mensagem ("Digite uma mensagem para +55 37 9967-4991") e no cabecalho
         quando o contato NAO esta salvo. Contato salvo mostra so o nome no topo
         — mas ao abrir "Dados do contato" (clicar no nome) o numero aparece no
         painel lateral. Lemos esse painel tambem. */
      const achados = new Set();
      const RE = /\+?55[\s.\-]?\(?\d{2}\)?[\s.\-]?9?\d{4}[\s.\-]?\d{4}/g;
      const empurra = (t) => {
        for (const m of String(t || '').matchAll(RE)) {
          const n = m[0].replace(/\D/g, '').replace(/^55/, '');
          if (n.length === 10 || n.length === 11) achados.add(n);
        }
      };
      // 1) Contato nao salvo: numero no campo de mensagem e no cabecalho.
      empurra(document.querySelector('#main footer [contenteditable="true"]')?.getAttribute('aria-label'));
      empurra(document.querySelector('#main header')?.innerText);
      /* 2) Contato salvo: varremos spans cujo texto INTEIRO e um telefone (e o
         formato do numero no painel "Dados do contato"). Ignoramos DUAS areas
         para nao pegar numero de outra conversa:
         - #main: a lista de mensagens (numero citado no papo);
         - #pane-side: a LISTA DE CONVERSAS a esquerda, onde contato nao salvo
           aparece com o numero como titulo (pegava o 1o da lista — visto com a
           Joyce, que puxou o numero de outro contato do topo). */
      const RE_CHEIA = /^\+?55[\s.\-]?\(?\d{2}\)?[\s.\-]?9?\d{4}[\s.\-]?\d{4}$/;
      for (const s of document.querySelectorAll('span[title], span[dir="auto"]')) {
        if (s.closest('#main') || s.closest('#pane-side')) continue;
        const txt = (s.getAttribute('title') || s.textContent || '').trim();
        if (RE_CHEIA.test(txt)) empurra(txt);
      }
      return [...achados].slice(0, 4);
    }
    const achados = new Set();
    const PADRAO = /\(?\d{2}\)?[\s-]?9?\d{4}[-\s]?\d{4}/g;
    const coletar = (texto) => {
      for (const m of String(texto || '').matchAll(PADRAO)) {
        const n = m[0].replace(/\D/g, '');
        if (n.length === 10 || n.length === 11) achados.add(n);
      }
    };

    for (const a of document.querySelectorAll('a[href^="tel:"]')) {
      const n = (a.getAttribute('href') || '').replace(/\D/g, '');
      if (n.length >= 10) achados.add(n);
    }

    /* O telefone do contato no FSS fica dentro de um CAMPO de formulario (com
       seletor de pais ao lado), e innerText nao le valor de campo — era por
       isso que o painel dizia "nao achei telefone" numa tela que mostrava o
       numero. Lemos os campos tambem. */
    for (const el of document.querySelectorAll('input, textarea')) {
      coletar(el.value);
      coletar(el.getAttribute('placeholder'));
    }
    coletar(document.body.innerText);

    return [...achados].slice(0, 8);
  }

  /* Posicao: no WhatsApp o canto inferior direito e a seta de ENVIAR — o painel
     ali cobre o botao mais usado da tela. Por isso ele flutua ACIMA do campo de
     escrita; no FSS o canto de baixo continua livre. Em ambos da para recolher
     numa bolinha (a escolha fica salva no navegador). */
  const CHAVE_MIN = 'brave_hub_painel_minimizado';
  const estaMinimizado = () => localStorage.getItem(CHAVE_MIN) === '1';

  function bolinha() {
    let b = document.getElementById(ID + '-bolha');
    if (b) return b;
    b = document.createElement('button');
    b.id = ID + '-bolha';
    b.type = 'button';
    b.textContent = '🦁';
    b.title = 'Abrir painel BRAVE';
    b.style.cssText = [
      'position:fixed', WA ? 'bottom:104px' : 'bottom:20px', 'right:16px',
      'z-index:2147483647', 'width:40px', 'height:40px', 'border-radius:50%',
      'border:none', 'background:#0f172a', 'color:#fff', 'font-size:18px',
      'cursor:pointer', 'box-shadow:0 4px 14px rgba(0,0,0,.35)', 'display:none',
    ].join(';');
    b.onclick = () => { localStorage.setItem(CHAVE_MIN, '0'); aplicarMinimizado(); };
    document.body.appendChild(b);
    return b;
  }

  function aplicarMinimizado() {
    const wrap = document.getElementById(ID + '-wrap');
    const min = estaMinimizado();
    if (wrap) wrap.style.display = min ? 'none' : 'flex';
    bolinha().style.display = min ? 'block' : 'none';
  }

  function painel() {
    let el = document.getElementById(ID);
    if (el) return el;

    const wrap = document.createElement('div');
    wrap.id = ID + '-wrap';
    wrap.style.cssText = [
      'position:fixed', WA ? 'bottom:104px' : 'bottom:20px', 'right:16px',
      'z-index:2147483647', 'background:#0f172a', 'color:#fff', 'border-radius:12px',
      'padding:10px 12px 12px', 'font:600 13px/1.35 system-ui,sans-serif',
      'box-shadow:0 6px 24px rgba(0,0,0,.35)', 'max-width:330px',
      'display:flex', 'flex-direction:column', 'gap:8px',
      /* O painel e ancorado embaixo e cresce para CIMA, entao o que passa da
         tela e o TOPO: com 22 produtos, sumiam a Esteira e o proprio titulo
         (relatado em 18/09). Limitamos a altura ao que cabe acima da ancora —
         20px no FSS, 104px no WhatsApp — e a lista passa a rolar. */
      /* box-sizing explicito: sem ele o max-height vale so para o CONTEUDO e o
         padding (10px+12px) estoura o limite — o painel ficava 2px acima da
         tela. E cada site tem seu box-sizing global, entao sem fixar aqui o
         FSS e o WhatsApp se comportariam diferente. */
      'box-sizing:border-box',
      `max-height:calc(100vh - ${WA ? 124 : 40}px)`,
    ].join(';');

    const barra = document.createElement('div');
    barra.style.cssText = 'display:flex;justify-content:flex-end;margin:-2px -2px 0 0';
    const min = document.createElement('button');
    min.type = 'button';
    min.textContent = '—';
    min.title = 'Recolher painel';
    min.style.cssText = 'background:transparent;border:none;color:#64748b;font:700 15px/1 system-ui;cursor:pointer;padding:0 4px';
    min.onclick = () => { localStorage.setItem(CHAVE_MIN, '1'); aplicarMinimizado(); };
    barra.appendChild(min);

    el = document.createElement('div');
    el.id = ID;
    /* Quem rola e o CONTEUDO, nao o painel inteiro: assim o botao de recolher
       fica sempre visivel no topo. `min-height:0` e obrigatorio — sem ele um
       filho de flex nao encolhe abaixo do proprio conteudo e o overflow nunca
       dispara. `overscroll-behavior:contain` impede que, ao chegar no fim da
       lista, a rolagem continue na conversa atras. */
    el.style.cssText = 'display:flex;flex-direction:column;gap:8px;'
      + 'overflow-y:auto;min-height:0;overscroll-behavior:contain;scrollbar-width:thin';

    wrap.append(barra, el);
    document.body.appendChild(wrap);
    bolinha();
    aplicarMinimizado();
    return el;
  }

  function botao(texto, cor, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = texto;
    b.style.cssText = [
      'background:' + cor, 'color:#fff', 'border:none', 'border-radius:8px',
      'padding:9px 12px', 'font:600 12px/1.2 system-ui,sans-serif',
      'cursor:pointer', 'text-align:left', 'width:100%',
    ].join(';');
    b.onclick = onClick;
    return b;
  }

  function status(texto, cor) {
    const p = painel();
    p.innerHTML = '';
    const s = document.createElement('div');
    s.textContent = texto;
    s.style.cssText = 'font-weight:600;color:' + (cor || '#e2e8f0');
    p.appendChild(s);
    return p;
  }

  /* Tipo pelo proprio endereco: o painel anexa PDF, video e agora foto — dar
     .mp4 a um JPEG faz o chat recusar ou mostrar arquivo quebrado. */
  const TIPOS_MIDIA = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };

  function tipoDaUrl(url) {
    const ext = (String(url).split('?')[0].split('.').pop() || '').toLowerCase();
    return { ext, mime: TIPOS_MIDIA[ext] || 'application/octet-stream' };
  }

  async function baixarComoArquivo(url, nome, tipo = 'application/pdf') {
    const r = await hubFetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    return new File([blob], nome, { type: tipo });
  }

  /* Descreve o que existe na tela agora — sem isso, "nao achei o campo de
     anexo" nao diz se falta o botao, se o campo esta escondido ou se o FSS o
     cria so na hora. */
  function radiografia() {
    const files = [...document.querySelectorAll('input[type="file"]')];
    return {
      files: files.length,
      accepts: files.map((i) => i.accept || '(qualquer)').join(' | ') || '-',
      textareas: document.querySelectorAll('textarea').length,
      editaveis: document.querySelectorAll('[contenteditable="true"]').length,
    };
  }

  /* O FSS cria o campo de arquivo so depois que o botao de anexo e acionado.
     Procuramos esse botao por rotulo e por icone (clipe/mais) e clicamos antes
     de tentar entregar o arquivo. */
  async function abrirAnexo() {
    const antes = document.querySelectorAll('input[type="file"]').length;
    const candidatos = [...document.querySelectorAll('button, [role="button"], label, a, div[class*="attach" i], span[class*="attach" i]')];
    const alvo = candidatos.find((b) => {
      const txt = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('title') || ''} ${b.className || ''} ${b.innerHTML || ''}`.toLowerCase();
      return /attach|anexo|anexar|paperclip|clipe|upload|arquivo|file/.test(txt);
    });
    if (!alvo) return false;
    alvo.click();
    await new Promise((r) => setTimeout(r, 900));
    return document.querySelectorAll('input[type="file"]').length > antes
      || document.querySelectorAll('input[type="file"]').length > 0;
  }

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

  /* Depois de enviar uma mensagem, o FSS desmonta e remonta a area de escrita —
     por instantes nao existe campo de arquivo NEM de texto (a radiografia
     mostrou arquivos:0 textareas:0). Insistir por alguns segundos evita o falso
     "sem campo de anexo" quando o usuario anexa a segunda proposta logo apos
     enviar a primeira. */
  async function esperarCampoAnexo(limiteMs = 8000) {
    const inicio = Date.now();
    while (Date.now() - inicio < limiteMs) {
      if (document.querySelector('input[type="file"]')) return true;
      await abrirAnexo();
      await dormir(600);
    }
    return !!document.querySelector('input[type="file"]');
  }

  /* Aceita um arquivo ou varios: a corda vai com as duas cores, e mandar as
     duas de uma vez (mesmo DataTransfer) evita depender de o chat aceitar um
     segundo anexo depois que o primeiro entrou. */
  function entregarAoChat(arquivos) {
    const lista = Array.isArray(arquivos) ? arquivos : [arquivos];
    const file = lista[0];
    // 1) campo de anexo do proprio chat (o ultimo costuma ser o da conversa aberta)
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    /* O filtro de accept vale para qualquer tipo que anexamos (PDF, vídeo ou
       foto): comparamos com o grupo MIME e a extensão do arquivo em mãos. */
    const grupo = (file.type || '').split('/')[0];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const aceita = (i) => {
      const a = (i.accept || '').toLowerCase();
      return !a || a.includes('*') || a.includes(grupo) || a.includes(ext);
    };
    const alvo = inputs.filter(aceita).pop();
    if (alvo) {
      const dt = new DataTransfer();
      for (const f of lista) dt.items.add(f);
      alvo.files = dt.files;
      alvo.dispatchEvent(new Event('input', { bubbles: true }));
      alvo.dispatchEvent(new Event('change', { bubbles: true }));
      return 'anexado no campo de arquivo';
    }
    // 2) colar no editor da mensagem
    const editor = document.querySelector('[contenteditable="true"], textarea');
    if (editor) {
      editor.focus();
      const dt = new DataTransfer();
      for (const f of lista) dt.items.add(f);
      editor.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: dt,
      }));
      return 'colado no campo de mensagem';
    }
    const r = radiografia();
    throw new Error(`sem campo de anexo (arquivos:${r.files} textareas:${r.textareas} editaveis:${r.editaveis})`);
  }

  /* Junta varias fotos numa IMAGEM so (grade com o nome de cada maquina embaixo).
     Por que colagem e nao album: o chat do FSS/WhatsApp manda cada anexo como uma
     mensagem separada — 5 fotos viravam 5 mensagens repetidas. Uma imagem = uma
     mensagem. Recebe [{file, nome}] (arquivos ja baixados por GM, viram objectURL
     para nao esbarrar no CSP ao desenhar no canvas). Devolve um File JPEG. */
  async function montarColagemFotos(entradas) {
    const imgs = [];
    for (const e of entradas) {
      const url = URL.createObjectURL(e.file);
      const img = new Image();
      img.src = url;
      try { await img.decode(); imgs.push({ img, url, nome: e.nome }); }
      catch (_) { URL.revokeObjectURL(url); } // foto quebrada: pula
    }
    if (!imgs.length) return null;
    const n = imgs.length;
    const cols = n === 1 ? 1 : (n <= 4 ? 2 : 3);
    const rows = Math.ceil(n / cols);
    const cellW = 500, imgH = 380, labelH = 46, gap = 12;
    const W = cols * cellW + (cols + 1) * gap;
    const H = rows * (imgH + labelH) + (rows + 1) * gap;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    imgs.forEach(({ img, nome }, k) => {
      const c = k % cols, rr = Math.floor(k / cols);
      const x = gap + c * (cellW + gap);
      const y = gap + rr * (imgH + labelH + gap);
      const escala = Math.min(cellW / img.width, imgH / img.height);
      const w = img.width * escala, h = img.height * escala;
      ctx.fillStyle = '#f1f5f9'; ctx.fillRect(x, y, cellW, imgH);
      ctx.drawImage(img, x + (cellW - w) / 2, y + (imgH - h) / 2, w, h);
      ctx.fillStyle = '#0f172a'; ctx.fillRect(x, y + imgH, cellW, labelH);
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 22px system-ui, Arial';
      ctx.textBaseline = 'middle';
      let nm = String(nome || '');
      if (ctx.measureText(nm).width > cellW - 20) {
        while (nm.length && ctx.measureText(nm + '…').width > cellW - 20) nm = nm.slice(0, -1);
        nm += '…';
      }
      ctx.fillText(nm, x + 12, y + imgH + labelH / 2);
    });
    imgs.forEach(({ url }) => URL.revokeObjectURL(url));
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));
    return blob ? new File([blob], 'linha.jpg', { type: 'image/jpeg' }) : null;
  }

  /* Escreve no campo de mensagem do chat.
     O FSS e feito em framework reativo: mexer no .value direto nao e percebido
     (o campo volta ao que era ao enviar). Por isso usamos o setter nativo do
     prototipo, que e o caminho que o framework escuta. */
  function escreverMensagem(texto) {
    if (WA) {
      const campo = document.querySelector('#main footer [contenteditable="true"]');
      if (!campo) return false;
      campo.focus();
      const dt = new DataTransfer();
      dt.setData('text/plain', texto);
      campo.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }));
      return true;
    }
    /* O FSS pode usar textarea, contenteditable ou um editor proprio; e logo
       apos enviar, nenhum deles existe por um instante. */
    const campo = document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"]')
      || document.querySelector('.ql-editor, [role="textbox"], div[class*="editor" i][contenteditable]');
    if (!campo) return false;

    if (campo.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      campo.focus();
      setter.call(campo, texto);
      campo.dispatchEvent(new Event('input', { bubbles: true }));
      campo.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    campo.focus();
    campo.textContent = texto;
    campo.dispatchEvent(new InputEvent('input', { bubbles: true, data: texto }));
    return true;
  }

  /* ── Follow-up FSS ─────────────────────────────────────────────────────────
     Leads da central (FSS) NAO recebem follow-up por WhatsApp (o cliente so
     falou com a BRAVE pelo FSS). O HUB lista os vencidos — mesmas mensagens e
     prazos da tela Follow Up LEADS — e aqui o Leo manda pelo proprio FSS:
     escreve no chat, ou copia o bloco pra IA do FSS enviar. Depois marca como
     enviado (grava no HUB, respeitando cooldown/dedup). */
  let _fupCache = { em: 0, itens: [] };
  let emFollowupLista = false;   // trava o remonte automatico de verificar() com a lista aberta
  let emListaOrcamentos = false; // idem, com a lista de ultimos orcamentos aberta
  async function followupsFss(forcar) {
    if (!forcar && Date.now() - _fupCache.em < 60000) return _fupCache.itens;
    try {
      const r = await hubFetch(`${HUB}/api/bling?acao=followup_fss`);
      const j = await r.json();
      if (j.ok) _fupCache = { em: Date.now(), itens: j.itens || [] };
    } catch (_) { /* mantem o cache anterior */ }
    return _fupCache.itens;
  }
  const _tel8 = (t) => String(t || '').replace(/\D/g, '').slice(-8);
  async function followupDoContato(tels) {
    const alvos = new Set((tels || []).map(_tel8).filter((t) => t.length === 8));
    if (!alvos.size) return null;
    const itens = await followupsFss();
    return itens.find((it) => alvos.has(_tel8(it.telefone))) || null;
  }
  async function marcarFollowupFss(item) {
    try {
      const r = await hubFetch(`${HUB}/api/bling?acao=followup_fss_marcar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, templateId: item.templateId, passo: item.passo }),
      });
      const j = await r.json();
      if (j.ok) _fupCache.itens = _fupCache.itens.filter((x) => x.id !== item.id);
      return j.ok;
    } catch (_) { return false; }
  }
  function copiar(texto) {
    if (typeof GM_setClipboard !== 'undefined') {
      GM_setClipboard(texto, { type: 'text', mimetype: 'text/plain' });
      return true;
    }
    try { navigator.clipboard.writeText(texto); return true; } catch (_) { return false; }
  }

  /* Bloco contextual: aparece no topo do painel quando o contato ABERTO tem
     follow-up FSS vencido. aoFim = o que fazer depois de uma acao (re-render). */
  function blocoFollowupFss(container, item, aoFim) {
    const cx = document.createElement('div');
    cx.style.cssText = 'border:1px solid #f59e0b55;background:#f59e0b14;border-radius:10px;padding:8px;margin:2px 0;display:flex;flex-direction:column;gap:6px';
    const tit = document.createElement('div');
    tit.textContent = `⏰ Follow-up FSS pendente — ${item.passo}`;
    tit.style.cssText = 'font:700 11px system-ui;color:#fbbf24';
    cx.appendChild(tit);
    cx.appendChild(botao('✍️ Escrever no chat', '#b45309', () => {
      const ok = escreverMensagem(item.mensagem);
      status(ok ? '✅ Follow-up escrito — revise e envie no FSS.' : '❌ Nao achei o campo de mensagem.', ok ? '#4ade80' : '#fca5a5');
      setTimeout(aoFim, 4000);
    }));
    cx.appendChild(botao('🤖 Mensagem p/ IA do FSS (copiar)', '#7c3aed', () => {
      const ok = copiar(item.mensagemIA);
      status(ok ? '✅ Bloco copiado — cole pra IA do FSS enviar.' : '❌ Nao consegui copiar.', ok ? '#4ade80' : '#fca5a5');
      setTimeout(aoFim, 4000);
    }));
    cx.appendChild(botao('✅ Marcar como enviado', '#166534', async () => {
      status('⏳ Marcando como enviado...');
      const ok = await marcarFollowupFss(item);
      status(ok ? '✅ Marcado como enviado.' : '❌ Nao consegui marcar.', ok ? '#4ade80' : '#fca5a5');
      setTimeout(aoFim, 2500);
    }));
    container.appendChild(cx);
  }

  /* Insere o bloco contextual no painel ja montado, se o contato aberto casar
     com algum follow-up FSS pendente. Assincrono: nao segura o render. */
  async function mostrarFollowupDoContato(painelEl) {
    const chaveAoChamar = ultimoTelefone; // se o contato trocar durante o fetch, aborta
    try {
      const item = await followupDoContato(acharTelefones());
      if (!item || ultimoTelefone !== chaveAoChamar || !painelEl.isConnected) return;
      const bloco = document.createElement('div');
      blocoFollowupFss(bloco, item, () => verificar(true));
      painelEl.insertBefore(bloco, painelEl.children[1] || null);
    } catch (_) { /* contexto nao-critico: silencia */ }
  }

  /* Texto ÚNICO com TODOS os pendentes, pra mandar de uma vez pra IA do FSS
     disparar cada um. */
  function textoGeralIaFss(itens) {
    const blocos = itens.map((it, i) =>
      `${i + 1}) ${it.cliente} — WhatsApp ${it.telefone}\n${it.mensagem}`);
    return [
      `Envie as ${itens.length} mensagens de follow-up abaixo — uma para cada cliente, no WhatsApp indicado. Envie exatamente o texto de cada uma:`,
      '',
      blocos.join('\n\n'),
    ].join('\n');
  }

  /* Últimos orçamentos criados — ver e enviar pelo WhatsApp, sem precisar abrir
     o contato. O envio usa o número do próprio orçamento (servidor). */
  async function montarListaOrcamentos() {
    emListaOrcamentos = true;
    const p = status('⏳ Buscando últimos orçamentos...');
    let itens = [];
    try {
      const r = await hubFetch(`${HUB}/api/bling?acao=ultimos_orcamentos&limite=10`);
      const j = await r.json();
      if (j.ok) itens = j.itens || [];
    } catch (_) { /* mostra vazio */ }
    p.innerHTML = '';
    const t = document.createElement('div');
    t.textContent = `📄 Últimos orçamentos (${itens.length})`;
    t.style.cssText = 'font:700 12px system-ui;color:#e2e8f0';
    p.appendChild(t);
    p.appendChild(botao('← Voltar', '#334155', () => { emListaOrcamentos = false; verificar(true); }));
    const lista = document.createElement('div');
    lista.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:380px;overflow:auto;margin-top:4px';
    p.appendChild(lista);
    if (!itens.length) {
      const vazio = document.createElement('div');
      vazio.textContent = 'Nenhum orçamento encontrado.';
      vazio.style.cssText = 'font-size:11px;color:#94a3b8';
      lista.appendChild(vazio);
      return;
    }
    for (const item of itens) {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #334155;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px';
      const h = document.createElement('div');
      h.textContent = item.cliente || '(sem nome)';
      h.style.cssText = 'font:700 11px system-ui;color:#e2e8f0';
      const data = item.criadoEm ? new Date(item.criadoEm).toLocaleDateString('pt-BR') : '';
      const env = item.enviadoEm ? `✅ enviado ${new Date(item.enviadoEm).toLocaleDateString('pt-BR')}` : '🆕 não enviado';
      const sub = document.createElement('div');
      sub.textContent = `${data} · ${env}${item.pdfs?.length ? (' · ' + item.pdfs.join('+')) : ''}`;
      sub.style.cssText = 'font-size:10px;color:#94a3b8';
      card.appendChild(h);
      card.appendChild(sub);
      if (item.arquivos && item.arquivos.length) {
        card.appendChild(botao('📲 Enviar pelo WhatsApp', '#166534', async () => {
          if (!window.confirm(`Enviar a proposta de ${item.cliente} no WhatsApp do cliente agora?`)) return;
          h.textContent = `${item.cliente} · enviando...`;
          try {
            const r = await hubFetch(`${HUB}/api/bling?acao=enviar_pdf_cliente`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ slug: item.slug }),
            });
            const j = await r.json();
            h.textContent = j.ok ? `${item.cliente} · enviado ✅` : `${item.cliente} · ${j.error || 'falhou'} ❌`;
          } catch (e) { h.textContent = `${item.cliente} · falha de rede ❌`; }
        }));
        card.appendChild(botao('💬 Copiar resumo', '#1e40af', () => {
          const ok = copiar(item.mensagem || '');
          h.textContent = ok ? `${item.cliente} · resumo copiado ✅` : `${item.cliente} · falhou ❌`;
        }));
      } else {
        const aviso = document.createElement('div');
        aviso.textContent = '⏳ PDF ainda sendo gerado — tente em instantes';
        aviso.style.cssText = 'font-size:10px;color:#fbbf24';
        card.appendChild(aviso);
      }
      lista.appendChild(card);
    }
  }

  /* Lista completa dos follow-ups FSS pendentes (visao geral). */
  async function montarListaFollowupFss() {
    emFollowupLista = true;   // segura o painel: verificar() nao remonta por baixo
    const p = status('⏳ Buscando follow-ups FSS...');
    const itens = await followupsFss(true);
    p.innerHTML = '';
    const t = document.createElement('div');
    t.textContent = `📋 Follow-ups FSS pendentes (${itens.length})`;
    t.style.cssText = 'font:700 12px system-ui;color:#e2e8f0';
    p.appendChild(t);
    p.appendChild(botao('← Voltar', '#334155', () => { emFollowupLista = false; verificar(true); }));
    if (itens.length) {
      p.appendChild(botao(`🤖 Copiar TODOS pra IA do FSS (${itens.length})`, '#7c3aed', () => {
        const ok = copiar(textoGeralIaFss(itens));
        t.textContent = ok ? `✅ ${itens.length} follow-ups copiados — cole pra IA do FSS` : '❌ Nao consegui copiar';
      }));
    }
    const lista = document.createElement('div');
    lista.style.cssText = 'display:flex;flex-direction:column;gap:8px;max-height:360px;overflow:auto;margin-top:4px';
    p.appendChild(lista);
    if (!itens.length) {
      const vazio = document.createElement('div');
      vazio.textContent = 'Nenhum follow-up FSS pendente 🎉';
      vazio.style.cssText = 'font-size:11px;color:#94a3b8';
      lista.appendChild(vazio);
      return;
    }
    for (const item of itens) {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #334155;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:6px';
      const h = document.createElement('div');
      h.textContent = `${item.cliente} · ${item.passo}`;
      h.style.cssText = 'font:700 11px system-ui;color:#e2e8f0';
      const sub = document.createElement('div');
      sub.textContent = `${item.telefone} · ${item.dias}d${item.prazoData ? (' · data ' + item.prazoData) : ''}`;
      sub.style.cssText = 'font-size:10px;color:#94a3b8';
      card.appendChild(h);
      card.appendChild(sub);
      card.appendChild(botao('🤖 Copiar p/ IA do FSS', '#7c3aed', () => {
        const ok = copiar(item.mensagemIA);
        h.textContent = ok ? `${item.cliente} · copiado ✅` : `${item.cliente} · falhou ❌`;
      }));
      card.appendChild(botao('💬 Copiar mensagem', '#1e40af', () => {
        const ok = copiar(item.mensagem);
        h.textContent = ok ? `${item.cliente} · mensagem copiada ✅` : `${item.cliente} · falhou ❌`;
      }));
      card.appendChild(botao('✅ Marcar enviado', '#166534', async () => {
        h.textContent = `${item.cliente} · marcando...`;
        const ok = await marcarFollowupFss(item);
        if (ok) card.remove(); else h.textContent = `${item.cliente} · falhou ❌`;
      }));
      lista.appendChild(card);
    }
  }

  /* Uma proposta por vez, ESCOLHIDA no painel — antes era uma fila fixa
     (a vista, depois a prazo) e, se a segunda falhasse, nao havia como pedir so
     ela de novo sem repetir a primeira. */
  async function anexarUm(arquivo) {
    status(`⏳ Anexando ${rotuloDe(arquivo)}...`);
    try {
      const file = await baixarComoArquivo(arquivo.url, arquivo.nome);
      if (!document.querySelector('input[type="file"]')) {
        status('⏳ Abrindo o anexo do chat...');
        await esperarCampoAnexo();
      }
      entregarAoChat(file);
      if (arquivo.mensagem) escreverMensagem(arquivo.mensagem);
      const p = status(`✅ ${rotuloDe(arquivo)} anexada com a mensagem — revise e envie.`, '#4ade80');
      p.appendChild(botao('↩︎ Voltar ao painel', '#334155', montarMenu));
    } catch (e) {
      const p = status(`❌ ${e.message}`, '#fca5a5');
      p.appendChild(botao('Tentar de novo', '#0e7490', () => anexarUm(arquivo)));
      p.appendChild(botao('↩︎ Voltar ao painel', '#334155', montarMenu));
    }
  }

  const rotuloDe = (a) => ({ avista: 'proposta à vista', prazo: 'proposta a prazo' }[a.tipo] || 'proposta');

  const voltar = () => (dados ? montarMenu() : montarSemProposta());

  /* ── Produtos: vídeo + texto pronto ──────────────────────────────
     O HUB monta as mensagens (acao=produtos_fss) com preços ao vivo do
     catálogo; aqui só listamos, baixamos o vídeo e escrevemos o texto.
     Cache por sessão da aba: o catálogo muda pouco durante o expediente. */
  let produtosCache = null;
  let rapidasServidor = [];   // mensagens prontas vindas do HUB

  async function carregarProdutos() {
    if (produtosCache) return produtosCache;
    const r = await hubFetch(`${HUB}/api/bling?acao=produtos_fss`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'catálogo indisponível');
    produtosCache = j.itens || [];
    rapidasServidor = j.rapidas || [];
    return produtosCache;
  }

  /* Mensagens prontas que o HUB serve e o painel ainda nao tem (a apresentacao
     institucional, por exemplo). Ficam no servidor para que mudar o texto nao
     obrigue a reinstalar o script — as locais seguem locais porque dependem da
     tela (nome do contato, link de cadastro com os dados ja preenchidos). */
  async function extrasDoServidor() {
    const locais = new Set(MENSAGENS_RAPIDAS.map((m) => m.id).filter(Boolean));
    try { await carregarProdutos(); } catch (_) { return []; }
    return rapidasServidor.filter((m) => !locais.has(m.id));
  }

  async function montarProdutos() {
    status('⏳ Carregando produtos...');
    let itens;
    try { itens = await carregarProdutos(); }
    catch (e) {
      const p = status(`❌ ${e.message}`, '#fca5a5');
      p.appendChild(botao('↩︎ Voltar', '#334155', voltar));
      return;
    }
    const p = painel();
    p.innerHTML = '';
    const t = document.createElement('div');
    t.textContent = '🎬 Produtos — vídeo + texto pronto';
    t.style.cssText = 'font-weight:700;font-size:12px;color:#e2e8f0';
    p.appendChild(t);
    for (const item of itens) {
      p.appendChild(botao(item.titulo, '#334155', () => enviarProduto(item)));
    }
    p.appendChild(botao('↩︎ Voltar ao painel', '#0e7490', voltar));
  }

  /* No WhatsApp o video nao e anexavel via DOM: o SERVIDOR envia (BotConversa)
     e a mensagem cai NESTA conversa em instantes. Como o envio e imediato,
     sem tela de revisao, pedimos confirmacao no painel antes. */
  function enviarProdutoWA(item) {
    const tel = acharTelefones()[0];
    if (!tel) {
      const p = status('❌ Não achei o número desta conversa. Abra os "Dados do contato" (clique no nome no topo) e clique em enviar de novo.', '#fca5a5');
      p.appendChild(botao('↩︎ Voltar', '#334155', montarProdutos));
      return;
    }
    const p = status(`Enviar ${item.titulo} (vídeo + texto) nesta conversa (${tel})?`);
    p.appendChild(botao('✅ Enviar agora', '#16a34a', async () => {
      status(`⏳ Enviando ${item.titulo}...`);
      try {
        const r = await hubFetch(`${HUB}/api/bling?acao=enviar_produto_cliente`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefone: tel, id: item.id }),
        });
        const j = await r.json();
        const s = status(j.ok ? `✅ ${item.titulo} enviado — chega na conversa em instantes.` : `❌ ${j.error}`,
          j.ok ? '#4ade80' : '#fca5a5');
        s.appendChild(botao('🎬 Outros produtos', '#334155', montarProdutos));
        s.appendChild(botao('↩︎ Voltar ao painel', '#334155', voltar));
      } catch (e) {
        const s = status(`❌ Falha de rede: ${e.message}`, '#fca5a5');
        s.appendChild(botao('↩︎ Voltar', '#334155', voltar));
      }
    }));
    p.appendChild(botao('↩︎ Cancelar', '#334155', montarProdutos));
  }

  async function enviarProduto(item) {
    if (WA) return enviarProdutoWA(item);
    status(`⏳ Preparando ${item.titulo}...`);
    try {
      /* midias = video quando existe, senao as fotos do produto. Antes so o
         video era anexado, e produto sem video (corda, sandbag) saia so com
         texto — o cliente nao via o que estava comprando. */
      const midias = (item.midias && item.midias.length ? item.midias : [item.video]).filter(Boolean);
      const arquivos = [];
      for (const [i, url] of midias.entries()) {
        const { ext, mime } = tipoDaUrl(url);
        arquivos.push(await baixarComoArquivo(url, `${item.id}${midias.length > 1 ? `-${i + 1}` : ''}.${ext || 'mp4'}`, mime));
      }
      if (arquivos.length) {
        if (!document.querySelector('input[type="file"]')) {
          status('⏳ Abrindo o anexo do chat...');
          await esperarCampoAnexo();
        }
        entregarAoChat(arquivos);
        await dormir(600); // o FSS remonta o editor logo após o anexo
      }
      const ok = escreverMensagem(item.texto);
      const quantos = arquivos.length;
      const p = status(quantos
        ? (ok ? `✅ ${quantos === 1 ? 'Mídia anexada' : `${quantos} mídias anexadas`} e texto escrito — revise e envie.` : '⚠️ Mídia anexada, mas não achei o campo de mensagem.')
        : (ok ? '✅ Texto escrito (produto sem mídia) — revise e envie.' : '❌ Não achei o campo de mensagem.'),
        ok ? '#4ade80' : '#fca5a5');
      p.appendChild(botao('🎬 Outros produtos', '#334155', montarProdutos));
      p.appendChild(botao('↩︎ Voltar ao painel', '#334155', voltar));
    } catch (e) {
      const p = status(`❌ ${e.message}`, '#fca5a5');
      p.appendChild(botao('Tentar de novo', '#0e7490', () => enviarProduto(item)));
      p.appendChild(botao('↩︎ Voltar', '#334155', voltar));
    }
  }

  async function enviarPeloWhatsApp() {
    status('⏳ Enviando pelo WhatsApp...');
    try {
      const r = await hubFetch(`${HUB}/api/bling?acao=enviar_pdf_cliente`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: dados.slug }),
      });
      const j = await r.json();
      status(j.ok ? `✅ Proposta enviada no WhatsApp de ${dados.cliente}` : `❌ ${j.error}`,
        j.ok ? '#4ade80' : '#fca5a5');
    } catch (e) {
      status(`❌ Falha de rede: ${e.message}`, '#fca5a5');
    }
    setTimeout(montarMenu, 5000);
  }

  /* Nome do contato, lido da tela de detalhes do FSS na hora do clique.
     Como no telefone, o valor vive dentro de um INPUT — e innerText nao le
     valor de campo. Entao procuramos o input cujo container tem o rotulo
     "Nome" na primeira linha; o innerText fica so de fallback (telas antigas
     ou campos exibidos como texto). Sem nome, a abertura sai generica. */
  function primeiroNomeDe(valor) {
    const n = String(valor || '').trim().split(/\s+/)[0].replace(/[^\p{L}'-]/gu, '');
    return n.length >= 2 ? n.toUpperCase() : null;
  }

  /* Valor do campo pelo rotulo, pareado por ORDEM DO DOCUMENTO.
     O diagnostico na tela real mostrou que o rotulo ("Nome") nao e ancestral
     do input — vive num elemento separado da arvore. O que o DOM garante e a
     ordem visual: rotulo → seu campo → proximo rotulo. Entao achamos a folha
     cujo texto e exatamente o rotulo e pegamos o primeiro input que vem depois
     dela na pagina. */
  function valorDoCampo(rotuloExatoRegex) {
    const campos = [...document.querySelectorAll('input, textarea')];
    const folhas = [...document.querySelectorAll('div, span, label, p')]
      .filter((e) => e.children.length === 0 && rotuloExatoRegex.test((e.textContent || '').trim()));
    for (const folha of folhas) {
      const campo = campos.find((c) =>
        folha.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
      const valor = String(campo?.value || '').trim();
      if (valor && valor !== '--') return valor;
    }
    return '';
  }

  const capitalizar = (s) => String(s || '').trim().toLowerCase()
    .replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

  /* Tudo que a tela do contato oferece para pre-preencher o cadastro. */
  function acharDadosContato() {
    if (WA) {
      return { nome: capitalizar(nomeContatoWA() || ''), email: '', telefone: acharTelefones()[0] || '' };
    }
    const nome = capitalizar(`${valorDoCampo(/^nome\b.{0,4}$/i)} ${valorDoCampo(/^sobrenome\b.{0,4}$/i)}`.trim());
    let email = valorDoCampo(/^e-?mail\b.{0,4}$/i);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) email = '';
    return { nome, email, telefone: acharTelefones()[0] || '' };
  }

  function acharPrimeiroNome() {
    if (WA) return primeiroNomeDe(nomeContatoWA() || '');
    // 1) input pareado ao rotulo "Nome" pela ordem do documento
    const porRotulo = valorDoCampo(/^nome\b.{0,4}$/i);
    if (porRotulo && !/\d/.test(porRotulo)) {
      const n = primeiroNomeDe(porRotulo);
      if (n) return n;
    }
    // 2) placeholder/aria/name do proprio input
    for (const campo of document.querySelectorAll('input, textarea')) {
      const valor = String(campo.value || '').trim();
      if (!valor || valor === '--' || /\d/.test(valor)) continue;
      const meta = `${campo.getAttribute('placeholder') || ''} ${campo.getAttribute('aria-label') || ''} ${campo.name || ''}`;
      if (/first[_ ]?name|(^|\s)nome(\s|$)/i.test(meta)) {
        const n = primeiroNomeDe(valor);
        if (n) return n;
      }
    }
    /* 3) valor exibido como TEXTO na linha seguinte ao rotulo. Varre TODAS as
       linhas "Nome" (a primeira pode ser rotulo seguido de outro rotulo) e
       tolera ate 6 caracteres depois de "Nome" na mesma linha (icone de +). */
    for (const m of document.body.innerText.matchAll(/(?:^|\n)[^\S\n]*Nome\b[^\n]{0,6}\n\s*([^\n]{2,40})/g)) {
      const n = m[1].trim();
      if (!n || n === '--' || /\d/.test(n) || /^(sobrenome|e-?mail|telefone|data)/i.test(n)) continue;
      const nome = primeiroNomeDe(n);
      if (nome) return nome;
    }
    return null;
  }

  /* Mensagens do inicio da conversa — usadas quando o contato ainda nao tem
     orcamento. Ficam sempre a mao no painel, porque e justamente nesse momento
     (lead novo, sem proposta) que o consultor mais digita a mesma coisa.
     texto pode ser funcao: avaliada no clique, com o contato aberto na tela. */
  /* Texto reserva do "Pedir cadastro", usado quando o HUB ainda nao entregou o
     dele (ou esta fora do ar). Tem que ser IGUAL ao de RAPIDAS em
     api/_fss-produtos.js — scripts/teste-mensagens-fixas.mjs confere. */
  const TEXTO_CADASTRO_RESERVA = [
    'Para gerar seu orçamento personalizado preciso dos seguintes dados:',
    'Empresa/Nome:',
    'CNPJ/CPF:',
    'Endereço:',
    'CEP:',
    'WhatsApp:',
    'E-mail:',
  ].join('\n');

  /* Reservas dos dados de pagamento e da chave Pix. Mesmo criterio do cadastro:
     iguais ao servidor (o teste confere) e usadas quando o HUB nao respondeu.
     Aqui a reserva pesa mais — e exatamente num dia de HUB lento que o cliente
     pede os dados para pagar, e eles nao podem depender da rede. */
  const TEXTO_PAGAMENTO_RESERVA = [
    'Segue nossos dados para Pagamento:',
    '',
    '➡️ Para pagamento via transferência: Conta: BTG',
    'Banco btg : 208',
    'Agência: 0050',
    'C corrente: 437636-6',
    'Cnpj: 33167844000180',
    'Razão Social: Brave Fitness Equipamentos ltda',
    '',
    '➡️ Para Pagamento via Pix:',
    'Chave Pix: contato@bravefitness.com.br',
    'Confirmando nome: Brave Fitness Equipamentos Ltda',
    '',
    '(Após o pagamento, favor enviar comprovante)',
  ].join('\n');
  const CHAVE_PIX_RESERVA = 'contato@bravefitness.com.br';

  /* Texto do HUB se ja carregado, senao a reserva. Nao espera rede no clique: o
     texto e fixo, e um HUB lento nao pode segurar uma mensagem que nao depende
     dele. */
  const textoDoServidor = (id, reserva) => {
    const m = rapidasServidor.find((r) => r.id === id);
    return (m && m.texto) || reserva;
  };

  const MENSAGENS_RAPIDAS = [
    {
      id: 'abertura', titulo: '👋 Abertura',
      texto: () => {
        const nome = acharPrimeiroNome();
        ultimoNomeAchado = nome; // o status conta se achou — visibilidade sem DevTools
        /* Abre espaco para a APRESENTACAO em vez de pedir a lista de
           equipamentos: perguntar "quais equipamentos" ja empurra a conversa
           para um orcamento grande, e orcamento de 10+ itens fecha 8,4% contra
           26,4% do de 1 item. Quem qualifica o escopo agora e o botao 🎯. */
        /* Handoff IA -> humano (2026-10-10): o lead vem de um atendimento feito
           por IA, entao a abertura deixa explicito que agora quem assume e o Leo,
           pessoalmente, de forma personalizada. "Pessoalmente/de perto/sob medida"
           eleva o valor percebido antes de qualificar; o "ja conhece a BRAVE?" no
           fim segue abrindo espaco pra apresentacao. */
        return nome
          ? `Fala ${nome}! 👊 Aqui é o Léo Berg, da BRAVE. A partir de agora quem assume seu atendimento sou eu, pessoalmente — vou te ajudar de perto pra montar a melhor solução pro seu caso. Pra começar: você já conhece a BRAVE?`
          : 'Opa, tudo bem? 👊 Aqui é o Léo Berg, da BRAVE. Agora quem assume seu atendimento sou eu, pessoalmente — vou te ajudar de perto pra montar a melhor solução pro seu caso. Pra começar: você já conhece a BRAVE?';
      },
    },
    {
      id: 'cadastro', titulo: '📋 Pedir cadastro',
      /* Desde 08/10/2026 nao ha mais link: o cadastro pede os dados na propria
         conversa (Empresa/Nome, CNPJ/CPF, Endereco, CEP, WhatsApp), e a
         resposta e colada no seletor de cliente do Gerador. O texto vem do HUB,
         para que mudar a redacao nao obrigue a reinstalar o script.
         Le o que JA foi carregado, sem esperar rede no clique: o texto e fixo, e
         um HUB lento nao pode segurar uma mensagem que nao depende dele. */
      texto: () => textoDoServidor('cadastro', TEXTO_CADASTRO_RESERVA),
    },
    {
      id: 'pagamento', titulo: '💳 Dados de pagamento',
      // O Pix vai em OUTRA mensagem (abaixo): o aviso lembra o proximo passo.
      dica: 'Agora envie a 🔑 Chave Pix, sozinha, para o cliente copiar.',
      texto: () => textoDoServidor('pagamento', TEXTO_PAGAMENTO_RESERVA),
    },
    {
      /* So a chave, em texto puro: o WhatsApp nao tem botao "Copiar" em mensagem
         comum, entao ela precisa ser a mensagem inteira — o cliente segura o
         balao e toca em Copiar. */
      id: 'pix', titulo: '🔑 Chave Pix (só a chave)',
      texto: () => textoDoServidor('pix', CHAVE_PIX_RESERVA),
    },
    {
      /* Enviada logo após mandar o link de pagamento (cartão, pela Barte). Avisa
         do 3DS — a verificação que mais derruba cartão próprio na hora de pagar —
         e pede a confirmação. Texto fixo no script; não depende do HUB. */
      id: 'link', titulo: '🔗 Link enviado (3DS)',
      dica: 'Avise que o cliente deve confirmar o pagamento depois.',
      texto: () => [
        '✅Link enviado',
        '🚨Usamos sistema de verificação 3DS, precisa de cartão próprio e liberação no app do seu banco',
        '🙋‍♂️Após realizar o pagamento nos avise',
      ].join('\n'),
    },
  ];

  /* ── Qualificação: as 5 perguntas antes de orçar ──────────────────
     Por que mora no painel, e nao numa tela do admin: a qualificacao acontece
     NA CONVERSA. Se o Leo tiver que abrir outra aba para anotar, ele nao anota
     — e a analise de 08/09/2026 mostrou que e justamente a falta disso que
     derruba os orcamentos grandes (9,8% de conversao acima de R$ 20 mil contra
     ~20% abaixo).

     Uma pergunta por vez: o botao escreve UMA pergunta no campo de mensagem
     para o Leo revisar e enviar. Despejar as cinco viraria formulario, e
     comprador sobrecarregado escolhe "depois eu vejo". */
  let emQualificacao = false;   // trava o remonte automatico de verificar()

  const COR_SINAL = {
    quente: '#f97316', multithread: '#a78bfa', preco: '#38bdf8',
    marca: '#4ade80', risco: '#fca5a5',
  };

  async function montarQualificacao() {
    const tel = acharTelefones()[0];
    if (!tel) {
      const p = status('❌ Nao achei o telefone desta conversa.', '#fca5a5');
      p.appendChild(botao('↩︎ Voltar', '#334155', voltar));
      return;
    }

    status('⏳ Carregando qualificação...');
    let j;
    try {
      const r = await hubFetch(`${HUB}/api/bling?acao=qualificacao&telefone=${tel}`);
      j = await r.json();
      if (!j.ok) throw new Error(j.error || 'o HUB recusou');
    } catch (e) {
      const p = status(`❌ ${e.message}`, '#fca5a5');
      p.appendChild(botao('↩︎ Voltar', '#334155', voltar));
      return;
    }

    emQualificacao = true;
    const nome = acharPrimeiroNome() || j.nome || '';
    const p = painel();
    p.innerHTML = '';

    const titulo = document.createElement('div');
    titulo.style.cssText = 'font-weight:700;font-size:12px;color:#e2e8f0';
    p.appendChild(titulo);

    const aviso = document.createElement('div');
    aviso.style.cssText = 'font:600 10px/1.2 system-ui;color:#64748b;min-height:12px';
    p.appendChild(aviso);

    const sinaisEl = document.createElement('div');
    sinaisEl.style.cssText = 'display:flex;flex-direction:column;gap:3px';

    const pintar = (resumo) => {
      const rotuloTrilha = { pontual: ' · pontual', projeto: ' · projeto' }[resumo.trilha] || '';
      titulo.textContent = `🎯 Qualificação${nome ? ' — ' + nome : ''}`
        + ` (${resumo.respondidas}/${resumo.total})${rotuloTrilha}`;
      sinaisEl.innerHTML = '';
      for (const s of resumo.sinais || []) {
        const d = document.createElement('div');
        d.textContent = '• ' + s.texto;
        d.style.cssText = 'font:600 10px/1.3 system-ui;color:' + (COR_SINAL[s.tipo] || '#94a3b8');
        sinaisEl.appendChild(d);
      }
    };

    /* Salvamento com atraso curto e por tecla (nao no blur): o painel pode ser
       remontado por uma troca de tela do WhatsApp, e resposta digitada na
       frente do cliente nao pode se perder. */
    const pendentes = {};
    let timer = null;

    async function salvar() {
      const envio = { ...pendentes };
      for (const k of Object.keys(pendentes)) delete pendentes[k];
      if (!Object.keys(envio).length) return;
      aviso.textContent = '⏳ salvando...';
      try {
        const r = await hubFetch(`${HUB}/api/bling?acao=qualificacao_salvar`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefone: tel, nome: acharDadosContato().nome || nome, respostas: envio }),
        });
        const jr = await r.json();
        if (!jr.ok) throw new Error(jr.error || 'o HUB recusou');
        pintar(jr.resumo);
        aviso.textContent = '✅ salvo';
      } catch (e) {
        aviso.textContent = '❌ nao salvou — ' + e.message;
      }
    }

    const agendar = (chave, valor) => {
      pendentes[chave] = valor;
      clearTimeout(timer);
      timer = setTimeout(salvar, 900);
    };

    const campos = {}; // chave -> textarea, para o copiloto ler o que está na tela
    for (const q of j.perguntas || []) {
      const linha = document.createElement('div');
      linha.style.cssText = 'display:flex;gap:6px;align-items:center';

      const rot = document.createElement('span');
      rot.textContent = q.titulo;
      rot.title = q.porque;   // o "por que" fica no hover, sem ocupar o painel
      rot.style.cssText = 'flex:1;font:600 11px/1.2 system-ui;color:#94a3b8;cursor:help';

      const perguntar = document.createElement('button');
      perguntar.type = 'button';
      perguntar.textContent = '✍️';
      perguntar.title = 'Escrever esta pergunta no chat';
      perguntar.style.cssText = 'background:#0e7490;border:none;border-radius:6px;color:#fff;'
        + 'cursor:pointer;padding:3px 7px;font-size:12px';
      perguntar.onclick = () => {
        const ok = escreverMensagem(q.pergunta);
        perguntar.textContent = ok ? '✅' : '❌';
        setTimeout(() => { perguntar.textContent = '✍️'; }, 2000);
      };
      linha.append(rot, perguntar);

      const campo = document.createElement('textarea');
      campo.value = (j.respostas || {})[q.chave] || '';
      campo.placeholder = 'anote a resposta dele...';
      campo.rows = 2;
      campo.style.cssText = 'width:100%;box-sizing:border-box;background:#1e293b;'
        + 'border:1px solid #334155;border-radius:6px;color:#e2e8f0;'
        + 'font:500 11px/1.35 system-ui;padding:5px 6px;resize:vertical';
      campo.oninput = () => agendar(q.chave, campo.value);
      campos[q.chave] = campo;

      /* Resposta por CLIQUE na pergunta que classifica o negocio: o Leo marca
         enquanto o cliente fala, sem digitar. Como a trilha decide quais
         perguntas vem depois, a tela e remontada assim que a escolha salva. */
      let opcoesEl = null;
      if (Array.isArray(q.opcoes) && q.opcoes.length) {
        opcoesEl = document.createElement('div');
        opcoesEl.style.cssText = 'display:flex;gap:4px';
        for (const op of q.opcoes) {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = op;
          const marcado = (j.respostas || {})[q.chave] === op;
          b.style.cssText = 'flex:1;border:1px solid #334155;border-radius:6px;cursor:pointer;'
            + 'padding:5px 6px;font:600 10px/1.2 system-ui;'
            + (marcado ? 'background:#7c3aed;color:#fff' : 'background:#1e293b;color:#94a3b8');
          b.onclick = async () => {
            clearTimeout(timer);
            pendentes[q.chave] = op;
            await salvar();
            montarQualificacao();
          };
          opcoesEl.appendChild(b);
        }
      }

      p.append(linha, ...(opcoesEl ? [opcoesEl] : []), campo);
    }

    p.appendChild(sinaisEl);
    pintar(j.resumo);

    /* Copiloto de IA (sob demanda): lê o que já está anotado e devolve a próxima
       pergunta personalizada + uma leitura estratégica. É assistivo — a IA
       propõe, o Léo revisa no campo e clica pra escrever no chat. */
    const copiloto = document.createElement('div');
    copiloto.style.cssText = 'display:flex;flex-direction:column;gap:5px;border-top:1px solid #334155;padding-top:7px';
    const saidaIA = document.createElement('div');
    saidaIA.style.cssText = 'display:flex;flex-direction:column;gap:5px';

    const renderSugestao = (s) => {
      saidaIA.innerHTML = '';
      if (s.leitura) {
        const l = document.createElement('div');
        l.textContent = '🧠 ' + s.leitura;
        l.style.cssText = 'font:600 10px/1.35 system-ui;color:#c4b5fd;background:#1e1b4b;border-radius:6px;padding:6px 7px';
        saidaIA.appendChild(l);
      }
      if (s.alerta) {
        const a = document.createElement('div');
        a.textContent = '⚠️ ' + s.alerta;
        a.style.cssText = 'font:600 10px/1.3 system-ui;color:#fca5a5';
        saidaIA.appendChild(a);
      }
      if (s.pergunta) {
        const ta = document.createElement('textarea');
        ta.value = s.pergunta; ta.rows = 2;
        ta.style.cssText = 'width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #7c3aed;'
          + 'border-radius:6px;color:#e2e8f0;font:500 11px/1.35 system-ui;padding:5px 6px;resize:vertical';
        const esc = botao('✍️ Escrever no chat', '#0e7490', () => {
          const ok = escreverMensagem(ta.value);
          esc.textContent = ok ? '✅ escrito' : '❌ falhou';
          setTimeout(() => { esc.textContent = '✍️ Escrever no chat'; }, 2000);
        });
        saidaIA.append(ta, esc);
      }
    };

    const btnIA = botao('✨ Me ajuda com a próxima', '#7c3aed', async () => {
      // Antes de pedir, garante que o que está na tela foi salvo (a leitura usa
      // as respostas — e não custa perder o texto recém-digitado).
      clearTimeout(timer);
      await salvar();
      const respostas = {};
      for (const [k, el] of Object.entries(campos)) {
        if (String(el.value || '').trim()) respostas[k] = el.value.trim();
      }
      btnIA.textContent = '⏳ pensando...'; btnIA.disabled = true;
      try {
        const r = await hubFetch(`${HUB}/api/bling?acao=qualificacao_sugerir`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telefone: tel, nome: acharDadosContato().nome || nome, respostas }),
        });
        const jr = await r.json();
        if (!jr.ok) throw new Error(jr.error || 'o HUB recusou');
        renderSugestao(jr);
      } catch (e) {
        saidaIA.innerHTML = '';
        const d = document.createElement('div');
        d.textContent = '❌ ' + e.message;
        d.style.cssText = 'font:600 10px/1.3 system-ui;color:#fca5a5';
        saidaIA.appendChild(d);
      } finally {
        btnIA.textContent = '✨ Me ajuda com a próxima'; btnIA.disabled = false;
      }
    });

    copiloto.append(btnIA, saidaIA);
    p.appendChild(copiloto);

    p.appendChild(botao('↩︎ Voltar ao painel', '#334155', async () => {
      clearTimeout(timer);
      await salvar();          // o que estiver na tela vai junto ao sair
      emQualificacao = false;
      ultimoTelefone = null;   // obriga verificar() a reavaliar do zero
      voltar();
    }));
  }

  /* ── Montar musculação: lista do lead -> comparativo por linha ────────────
     O lead manda uma lista genérica ("01 cross, 01 leg press, 01 peck deck...")
     e a mesma máquina existe em várias linhas, com preço e estoque diferentes.
     O HUB faz a conta (api/_musculacao-montador.js) e devolve o texto pronto;
     aqui só se cola a lista, confere e escreve no chat. Quem escolhe a linha é o
     Leo — só UMA proposta por cliente vai ao Bling. Reaproveita a trava de
     remonte da qualificação: colar a lista não pode ser apagado por um remonte. */
  async function montarMusculacao() {
    emQualificacao = true;
    const p = painel();
    p.innerHTML = '';

    const titulo = document.createElement('div');
    titulo.textContent = '🏋️ Montar musculação';
    titulo.style.cssText = 'font-weight:700;font-size:12px;color:#e2e8f0';
    p.appendChild(titulo);

    const dica = document.createElement('div');
    dica.textContent = 'Cole a lista de máquinas que o lead mandou:';
    dica.style.cssText = 'font:600 10px/1.3 system-ui;color:#94a3b8';
    p.appendChild(dica);

    const lista = document.createElement('textarea');
    lista.rows = 5;
    lista.placeholder = '01 cross\n01 leg press\n01 peck deck\n2 extensoras...';
    lista.style.cssText = 'width:100%;box-sizing:border-box;background:#1e293b;border:1px solid #334155;'
      + 'border-radius:6px;color:#e2e8f0;font:500 11px/1.35 system-ui;padding:5px 6px;resize:vertical';
    p.appendChild(lista);

    const todasLabel = document.createElement('label');
    todasLabel.style.cssText = 'display:flex;gap:6px;align-items:center;font:600 10px/1.2 system-ui;color:#94a3b8;cursor:pointer';
    const todas = document.createElement('input');
    todas.type = 'checkbox';
    todasLabel.append(todas, document.createTextNode('Incluir Plate Loaded e todas as linhas'));
    p.appendChild(todasLabel);

    const aviso = document.createElement('div');
    aviso.style.cssText = 'font:600 10px/1.3 system-ui;color:#64748b;min-height:12px';
    p.appendChild(aviso);

    const saida = document.createElement('textarea');
    saida.rows = 10;
    saida.readOnly = true;
    saida.style.cssText = 'display:none;width:100%;box-sizing:border-box;background:#0f172a;'
      + 'border:1px solid #334155;border-radius:6px;color:#e2e8f0;font:500 11px/1.35 system-ui;'
      + 'padding:5px 6px;resize:vertical';
    p.appendChild(saida);

    const escrever = botao('✍️ Escrever comparativo', '#334155', () => {
      const ok = escreverMensagem(saida.value);
      aviso.textContent = ok ? '✅ Comparativo escrito — revise e envie.' : '❌ Nao achei o campo de mensagem.';
      aviso.style.color = ok ? '#4ade80' : '#fca5a5';
    });
    escrever.style.display = 'none';

    /* Envio POR LINHA: cada linha vira UMA mensagem com as fotos daquela linha +
       o texto daquela linha (maquinas, a vista, a prazo, estoque). Assim fica
       claro qual foto e de qual linha, e o Leo manda linha por linha. As fotos
       vivem no bucket publico produtos_media (ja no @connect). Pensado pro chat
       do FSS; no WhatsApp o anexo por DOM pode nao pegar. */
    const linhasBox = document.createElement('div');
    linhasBox.style.cssText = 'display:flex;flex-direction:column;gap:4px';

    const nomeCurto = (nome) => String(nome || '').split(' - ')[0].trim(); // tira o " - HardBrave"

    async function enviarLinhaMusc(L, btn) {
      const comFoto = (L.itens || []).filter((i) => i.produto && i.produto.foto);
      btn.disabled = true;
      aviso.textContent = `⏳ ${L.rotulo}: baixando ${comFoto.length} foto(s)...`; aviso.style.color = '#64748b';
      try {
        const entradas = [];
        for (const i of comFoto) {
          const { ext, mime } = tipoDaUrl(i.produto.foto);
          const file = await baixarComoArquivo(i.produto.foto, `${i.produto.sku || 'maquina'}.${ext || 'jpg'}`, mime);
          entradas.push({ file, nome: nomeCurto(i.produto.nome) });
        }
        let anexou = 0;
        if (entradas.length) {
          aviso.textContent = `⏳ ${L.rotulo}: montando a imagem...`;
          const colagem = await montarColagemFotos(entradas);
          if (colagem) {
            if (!document.querySelector('input[type="file"]')) await esperarCampoAnexo();
            entregarAoChat([colagem]); // UMA imagem com todas as fotos = UMA mensagem
            await dormir(600); // o FSS remonta o editor logo apos o anexo
            anexou = entradas.length;
          }
        }
        const ok = escreverMensagem(L.mensagem || '');
        aviso.textContent = ok
          ? `✅ ${L.rotulo}: imagem com ${anexou} foto(s) + texto — revise e envie.`
          : `⚠️ ${L.rotulo}: imagem anexada, mas nao achei o campo de mensagem.`;
        aviso.style.color = ok ? '#4ade80' : '#fbbf24';
      } catch (e) {
        aviso.textContent = `❌ ${L.rotulo}: ${e.message}`; aviso.style.color = '#fca5a5';
      } finally {
        btn.disabled = false;
      }
    }

    const montar = botao('🧮 Montar opções', '#b45309', async () => {
      if (!lista.value.trim()) { aviso.textContent = 'Cole a lista primeiro.'; aviso.style.color = '#fca5a5'; return; }
      aviso.textContent = '⏳ montando...'; aviso.style.color = '#64748b';
      montar.disabled = true;
      try {
        const r = await hubFetch(`${HUB}/api/bling?acao=montar_musculacao`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: lista.value, linhas: todas.checked ? 'todas' : '' }),
        });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error || 'o HUB recusou');
        saida.value = j.mensagem;
        saida.style.display = 'block';
        escrever.style.display = 'block';
        // Um botão por linha: manda a mensagem + as fotos daquela linha juntas.
        linhasBox.innerHTML = '';
        for (const L of (j.linhas || [])) {
          const comFoto = (L.itens || []).filter((i) => i.produto && i.produto.foto).length;
          const b = botao(`📨 Linha ${L.rotulo} — ${comFoto} foto(s)`, '#be185d', () => enviarLinhaMusc(L, b));
          linhasBox.appendChild(b);
        }
        const n = (j.linhas || []).length;
        const semEstoque = j.estoque_ok ? '' : ' · ⚠️ estoque nao conferido (texto diz "a confirmar")';
        aviso.textContent = `✅ ${n} linha(s) montada(s)${semEstoque}`;
        aviso.style.color = j.estoque_ok ? '#4ade80' : '#fbbf24';
      } catch (e) {
        aviso.textContent = '❌ ' + e.message;
        aviso.style.color = '#fca5a5';
      } finally {
        montar.disabled = false;
      }
    });
    p.append(montar, escrever, linhasBox);

    p.appendChild(botao('↩︎ Voltar ao painel', '#334155', () => {
      emQualificacao = false;
      ultimoTelefone = null;
      voltar();
    }));
  }

  function adicionarAtalhos(painelEl) {
    // Follow-ups FSS pendentes (lista geral). O contador chega em seguida.
    const bFup = botao('📋 Follow-ups FSS pendentes', '#92400e', montarListaFollowupFss);
    painelEl.appendChild(bFup);
    followupsFss().then((itens) => {
      if (bFup.isConnected) bFup.textContent = `📋 Follow-ups FSS pendentes (${itens.length})`;
    });
    // Últimos orçamentos criados (ver + enviar).
    painelEl.appendChild(botao('📄 Últimos orçamentos', '#0f766e', montarListaOrcamentos));
    const linha = document.createElement('div');
    linha.textContent = 'Mensagens prontas';
    linha.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-top:2px';
    painelEl.appendChild(linha);
    const criarBotao = (m) => botao(m.titulo, '#334155', async () => {
        status(`⏳ Preparando ${m.titulo}...`);
        ultimoNomeAchado = null;
        const texto = typeof m.texto === 'function' ? await m.texto() : m.texto;
        const ok = escreverMensagem(texto);
        const extra = m.titulo.includes('Abertura')
          ? (ultimoNomeAchado ? ` para ${ultimoNomeAchado}` : ' (sem nome na tela)') : '';
        const dica = ok && m.dica ? ` ${m.dica}` : '';
        status(ok ? `✅ ${m.titulo} escrita${extra} — revise e envie.${dica}` : '❌ Nao achei o campo de mensagem.',
          ok ? '#4ade80' : '#fca5a5');
        // Com aviso de proximo passo, a tela fica mais tempo: da para ler.
        setTimeout(voltar, dica ? 8000 : 4000);
    });

    /* ORDEM DO PAINEL = ordem real da conversa (pedido do Leo, 08/09/2026):
       abre, apresenta a marca, qualifica, so entao mostra produto e pede
       cadastro. Antes a ordem saia de um insertBefore no penultimo filho, que
       nao dava controle nenhum — a apresentacao caia onde desse.

       Agora cada posicao e explicita. A apresentacao vem do SERVIDOR e pode
       demorar, entao ela ganha um espaco reservado que e preenchido quando
       chega: o painel aparece inteiro na hora, sem esperar a rede, e sem que a
       mensagem pule de lugar depois. */
    const porId = new Map(MENSAGENS_RAPIDAS.map((m) => [m.id, m]));
    const vaga = document.createElement('div');   // reservado para a apresentacao
    vaga.style.cssText = 'display:contents';

    if (porId.has('abertura')) painelEl.appendChild(criarBotao(porId.get('abertura')));
    painelEl.appendChild(vaga);
    painelEl.appendChild(botao('🎯 Qualificar cliente', '#7c3aed', montarQualificacao));
    painelEl.appendChild(botao('🎬 Produtos (vídeo + texto)', '#0e7490', montarProdutos));
    painelEl.appendChild(botao('🏋️ Montar musculação (lista do lead)', '#b45309', montarMusculacao));
    if (porId.has('cadastro')) painelEl.appendChild(criarBotao(porId.get('cadastro')));

    // Qualquer mensagem local nova entra no fim, sem precisar mexer aqui.
    for (const m of MENSAGENS_RAPIDAS) {
      if (m.id !== 'abertura' && m.id !== 'cadastro') painelEl.appendChild(criarBotao(m));
    }

    extrasDoServidor().then((extras) => {
      if (!painelEl.isConnected) return;  // painel ja foi remontado
      for (const m of extras) vaga.appendChild(criarBotao(m));
    });
  }

  /* Painel para contato sem orcamento: so os atalhos de mensagem. */
  function montarSemProposta(texto) {
    const p = painel();
    p.innerHTML = '';
    const t = document.createElement('div');
    t.textContent = (texto || '🦁 BRAVE — sem proposta para este contato') + `  · v${VERSAO}`;
    t.style.cssText = 'font-weight:700;font-size:11px;color:#94a3b8;line-height:1.35';
    p.appendChild(t);
    adicionarAtalhos(p);
    mostrarFollowupDoContato(p);
  }

  function montarMenu() {
    const p = painel();
    p.innerHTML = '';
    const t = document.createElement('div');
    t.textContent = `Proposta de ${dados.cliente}`;
    t.style.cssText = 'font-weight:700;font-size:12px;color:#e2e8f0';
    p.appendChild(t);
    if (dados.enviadoEm) {
      const s = document.createElement('div');
      s.textContent = `já enviada em ${new Date(dados.enviadoEm).toLocaleDateString('pt-BR')}`;
      s.style.cssText = 'font-size:11px;color:#94a3b8;font-weight:500';
      p.appendChild(s);
    }
    // No WhatsApp nao ha campo de anexo alcancavel: o caminho e o envio pelo
    // servidor ("Enviar pelo WhatsApp"), que cai nesta mesma conversa.
    for (const arquivo of (WA ? [] : dados.arquivos || [])) {
      const rot = { avista: '💰 Anexar À VISTA', prazo: '💳 Anexar A PRAZO' }[arquivo.tipo] || '📎 Anexar proposta';
      p.appendChild(botao(rot, '#0e7490', () => anexarUm(arquivo)));
    }
    if (dados.mensagem) {
      p.appendChild(botao('💬 Escrever resumo completo', '#1e40af', () => {
        status(escreverMensagem(dados.mensagem)
          ? '✅ Mensagem escrita — revise e envie.'
          : '❌ Nao achei o campo de mensagem.', escreverMensagem ? '#4ade80' : '#fca5a5');
        setTimeout(montarMenu, 4000);
      }));
    }
    p.appendChild(botao('📲 Enviar pelo WhatsApp', '#334155', enviarPeloWhatsApp));
    adicionarAtalhos(p);
    mostrarFollowupDoContato(p);
  }

  async function verificar(forcar) {
    // Qualificacao ou alguma lista (follow-up / orcamentos) aberta: nao remonta.
    if (emQualificacao || emFollowupLista || emListaOrcamentos) return;
    const tels = acharTelefones();
    const chave = tels.join(',');
    if (!forcar && chave === ultimoTelefone) return; // mesma tela, ja avaliada
    ultimoTelefone = chave;

    if (!tels.length) {
      /* Antes o painel sumia aqui, e o Leo nao tinha como saber se o script
         estava vivo. Agora ele fala — e ja oferece as mensagens de abertura. */
      dados = null;
      montarSemProposta('🦁 BRAVE — abra a conversa de um cliente');
      return;
    }

    status(`⏳ BRAVE: procurando proposta (${tels.length} telefone${tels.length > 1 ? 's' : ''})...`);
    for (const tel of tels) {
      try {
        const r = await hubFetch(`${HUB}/api/bling?acao=proposta_por_telefone&telefone=${tel}`);
        const j = await r.json();
        if (j.encontrado) {
          dados = j;
          montarMenu();
          return;
        }
      } catch (e) {
        status(`❌ BRAVE: nao consegui falar com o HUB — ${e.message}`, '#fca5a5');
        return;
      }
    }
    dados = null;
    montarSemProposta('🦁 BRAVE — este contato ainda não tem proposta');
  }

  // O SPA troca de contato sem recarregar: revalida periodicamente.
  verificar();
  setInterval(verificar, 3000);
})();
