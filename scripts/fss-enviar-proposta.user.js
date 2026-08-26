// ==UserScript==
// @name         Brave HUB — Proposta no FSS
// @namespace    bravefitness.com.br
// @version      2.5
// @description  Anexa os PDFs oficiais da proposta direto na conversa do FSS, sem baixar arquivo no computador.
// @match        https://app.fullsalessystem.com/v2/location/*
// @run-at       document-idle
// @grant        none
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
  const ID = 'brave-hub-proposta';
  let ultimoTelefone = null;
  let dados = null;
  let indiceAtual = 0;

  /* O painel de contato do FSS mostra mais de um telefone (principal e
     adicional), e nem sempre o cadastrado no HUB e o primeiro. Em vez de
     adivinhar, juntamos todos os candidatos da tela e perguntamos ao HUB por
     cada um ate achar. */
  function acharTelefones() {
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

  async function baixarComoArquivo(url, nome) {
    const r = await fetch(url, { credentials: 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    return new File([blob], nome, { type: 'application/pdf' });
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

  function entregarAoChat(file) {
    // 1) campo de anexo do proprio chat (o ultimo costuma ser o da conversa aberta)
    const inputs = [...document.querySelectorAll('input[type="file"]')];
    const aceita = (i) => {
      const a = (i.accept || '').toLowerCase();
      return !a || a.includes('pdf') || a.includes('application') || a.includes('*');
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
    const campo = document.querySelector('textarea')
      || document.querySelector('[contenteditable="true"]');
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

  async function anexarProximo() {
    const arquivos = dados?.arquivos || [];
    if (!arquivos.length) return;
    const a = arquivos[indiceAtual];
    status(`⏳ Anexando: ${a.nome}`);
    try {
      const file = await baixarComoArquivo(a.url, a.nome);
      if (!document.querySelector('input[type="file"]')) {
        status(`⏳ Abrindo o anexo do chat...`);
        await abrirAnexo();
      }
      const via = entregarAoChat(file);
      const restam = arquivos.length - indiceAtual - 1;
      const p = status(`✅ ${via.charAt(0).toUpperCase() + via.slice(1)}: ${a.nome}`, '#4ade80');
      if (restam > 0) {
        indiceAtual += 1;
        p.appendChild(botao(`📎 Envie essa e clique para a próxima (${restam})`, '#0e7490', anexarProximo));
      } else {
        indiceAtual = 0;
        // Ultimo anexo: ja deixa a mensagem escrita, com os valores.
        if (dados?.mensagem && escreverMensagem(dados.mensagem)) {
          status(`✅ Anexos e mensagem prontos — revise e envie.`, '#4ade80');
        }
        p.appendChild(botao('📎 Anexar tudo de novo', '#334155', () => { indiceAtual = 0; anexarProximo(); }));
      }
    } catch (e) {
      const p = status(`❌ ${e.message}`, '#fca5a5');
      p.appendChild(botao('Tentar de novo', '#0e7490', anexarProximo));
    }
  }

  async function enviarPeloWhatsApp() {
    status('⏳ Enviando pelo WhatsApp...');
    try {
      const r = await fetch(`${HUB}/api/bling?acao=enviar_pdf_cliente`, {
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

  /* Mensagens do inicio da conversa — usadas quando o contato ainda nao tem
     orcamento. Ficam sempre a mao no painel, porque e justamente nesse momento
     (lead novo, sem proposta) que o consultor mais digita a mesma coisa. */
  const MENSAGENS_RAPIDAS = [
    {
      titulo: '👋 Abertura',
      texto: 'Aqui é o Léo Berg da BRAVE, tudo bem? Quais equipamentos você busca?',
    },
    {
      titulo: '📋 Pedir cadastro',
      texto: 'Para realizar seu orçamento personalizado, por favor preencha esse cadastro\nhttps://brave-hub-two.vercel.app/cadastro\nMe avise quando finalizar',
    },
  ];

  function adicionarAtalhos(painelEl) {
    const linha = document.createElement('div');
    linha.textContent = 'Mensagens prontas';
    linha.style.cssText = 'font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-top:2px';
    painelEl.appendChild(linha);
    for (const m of MENSAGENS_RAPIDAS) {
      painelEl.appendChild(botao(m.titulo, '#334155', () => {
        const ok = escreverMensagem(m.texto);
        const p = status(ok ? `✅ ${m.titulo} escrita — revise e envie.` : '❌ Nao achei o campo de mensagem.',
          ok ? '#4ade80' : '#fca5a5');
        setTimeout(() => (dados ? montarMenu() : montarSemProposta(p)), 3500);
      }));
    }
  }

  /* Painel para contato sem orcamento: so os atalhos de mensagem. */
  function montarSemProposta(texto) {
    const p = painel();
    p.innerHTML = '';
    const t = document.createElement('div');
    t.textContent = texto || '🦁 BRAVE — sem proposta para este contato';
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
    indiceAtual = 0;
    p.appendChild(botao('📎 Anexar aqui na conversa', '#0e7490', anexarProximo));
    if (dados.mensagem) {
      p.appendChild(botao('💬 Escrever a mensagem', '#1e40af', () => {
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
        const r = await fetch(`${HUB}/api/bling?acao=proposta_por_telefone&telefone=${tel}`);
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
