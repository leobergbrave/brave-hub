// ==UserScript==
// @name         Brave HUB — Proposta no FSS
// @namespace    bravefitness.com.br
// @version      3.5
// @description  Painel BRAVE no FSS e no WhatsApp Web: propostas, vídeos de produtos com texto pronto, mensagens rápidas e cadastro pré-preenchido.
// @match        https://app.fullsalessystem.com/v2/location/*
// @match        https://web.whatsapp.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
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
  const VERSAO = '3.5'; // aparece no painel — confirma qual versao esta instalada
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
        onload: (r) => resolve({
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          blob: async () => r.response,
          text: async () => r.response.text(),
          json: async () => JSON.parse(await r.response.text()),
        }),
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
         quando o contato nao esta salvo. Contato salvo mostra so o nome —
         nesse caso nao ha numero na tela. */
      const achados = new Set();
      const fontes = [
        document.querySelector('#main footer [contenteditable="true"]')?.getAttribute('aria-label') || '',
        document.querySelector('#main header')?.innerText || '',
      ];
      for (const t of fontes) {
        for (const m of String(t).matchAll(/\+?55[\s.\-]?\(?\d{2}\)?[\s.\-]?9?\d{4}[\s.\-]?\d{4}/g)) {
          const n = m[0].replace(/\D/g, '').replace(/^55/, '');
          if (n.length === 10 || n.length === 11) achados.add(n);
        }
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

  function painel() {
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'background:#0f172a', 'color:#fff', 'border-radius:12px', 'padding:12px 14px',
      'font:600 13px/1.35 system-ui,sans-serif', 'box-shadow:0 6px 24px rgba(0,0,0,.35)',
      'max-width:330px', 'display:flex', 'flex-direction:column', 'gap:8px',
    ].join(';');
    document.body.appendChild(el);
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

  function entregarAoChat(file) {
    // 1) campo de anexo do proprio chat (o ultimo costuma ser o da conversa aberta)
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    /* O filtro de accept vale para qualquer tipo que anexamos (PDF ou vídeo):
       comparamos com o grupo MIME e a extensão do arquivo em mãos. */
    const grupo = (file.type || '').split('/')[0];
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const aceita = (i) => {
      const a = (i.accept || '').toLowerCase();
      return !a || a.includes('*') || a.includes(grupo) || a.includes(ext);
    };
    const alvo = inputs.filter(aceita).pop();
    if (alvo) {
      const dt = new DataTransfer();
      dt.items.add(file);
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
      dt.items.add(file);
      editor.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: dt,
      }));
      return 'colado no campo de mensagem';
    }
    const r = radiografia();
    throw new Error(`sem campo de anexo (arquivos:${r.files} textareas:${r.textareas} editaveis:${r.editaveis})`);
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

  async function carregarProdutos() {
    if (produtosCache) return produtosCache;
    const r = await hubFetch(`${HUB}/api/bling?acao=produtos_fss`);
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || 'catálogo indisponível');
    produtosCache = j.itens || [];
    return produtosCache;
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
      const p = status('❌ Não achei o número desta conversa (contato salvo mostra só o nome).', '#fca5a5');
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
      if (item.video) {
        const file = await baixarComoArquivo(item.video, `${item.id}.mp4`, 'video/mp4');
        if (!document.querySelector('input[type="file"]')) {
          status('⏳ Abrindo o anexo do chat...');
          await esperarCampoAnexo();
        }
        entregarAoChat(file);
        await dormir(600); // o FSS remonta o editor logo após o anexo
      }
      const ok = escreverMensagem(item.texto);
      const p = status(item.video
        ? (ok ? '✅ Vídeo anexado e texto escrito — revise e envie.' : '⚠️ Vídeo anexado, mas não achei o campo de mensagem.')
        : (ok ? '✅ Texto escrito (produto sem vídeo) — revise e envie.' : '❌ Não achei o campo de mensagem.'),
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
  const MENSAGENS_RAPIDAS = [
    {
      titulo: '👋 Abertura',
      texto: () => {
        const nome = acharPrimeiroNome();
        ultimoNomeAchado = nome; // o status conta se achou — visibilidade sem DevTools
        return nome
          ? `Fala ${nome}, tudo bem? Aqui é o Léo Berg da BRAVE 👊 Quais equipamentos você busca?`
          : 'Aqui é o Léo Berg da BRAVE, tudo bem? Quais equipamentos você busca?';
      },
    },
    {
      titulo: '📋 Pedir cadastro',
      /* Gera um link com token: a pagina /cadastro busca nome/telefone/e-mail
         pelo token e preenche sozinha — o cliente completa so CPF e endereco.
         Sem dados na tela ou HUB fora do ar, cai no link generico de sempre. */
      texto: async () => {
        const d = acharDadosContato();
        if (d.nome || d.email || d.telefone) {
          try {
            const r = await hubFetch(`${HUB}/api/bling?acao=cadastro_prefill_criar`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d),
            });
            const j = await r.json();
            if (j.ok) {
              const oi = d.nome ? `${primeiroNomeDe(d.nome)}, para` : 'Para';
              return `${oi} realizar seu orçamento personalizado é só confirmar seu cadastro nesse link — seus dados já estão preenchidos, falta só completar 😉\n${j.url}\nMe avise quando finalizar`;
            }
          } catch (_) { /* cai no generico */ }
        }
        return 'Para realizar seu orçamento personalizado, por favor preencha esse cadastro\nhttps://brave-hub-two.vercel.app/cadastro\nMe avise quando finalizar';
      },
    },
  ];

  function adicionarAtalhos(painelEl) {
    const linha = document.createElement('div');
    linha.textContent = 'Mensagens prontas';
    linha.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-top:2px';
    painelEl.appendChild(linha);
    for (const m of MENSAGENS_RAPIDAS) {
      painelEl.appendChild(botao(m.titulo, '#334155', async () => {
        status(`⏳ Preparando ${m.titulo}...`);
        ultimoNomeAchado = null;
        const texto = typeof m.texto === 'function' ? await m.texto() : m.texto;
        const ok = escreverMensagem(texto);
        const extra = m.titulo.includes('Abertura')
          ? (ultimoNomeAchado ? ` para ${ultimoNomeAchado}` : ' (sem nome na tela)') : '';
        status(ok ? `✅ ${m.titulo} escrita${extra} — revise e envie.` : '❌ Nao achei o campo de mensagem.',
          ok ? '#4ade80' : '#fca5a5');
        setTimeout(voltar, 4000);
      }));
    }
    painelEl.appendChild(botao('🎬 Produtos (vídeo + texto)', '#0e7490', montarProdutos));
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
  }

  async function verificar() {
    const tels = acharTelefones();
    const chave = tels.join(',');
    if (chave === ultimoTelefone) return; // mesma tela, ja avaliada
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
