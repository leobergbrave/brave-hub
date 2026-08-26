// ==UserScript==
// @name         Brave HUB — Proposta no FSS
// @namespace    bravefitness.com.br
// @version      2.1
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
    for (const a of document.querySelectorAll('a[href^="tel:"]')) {
      const n = (a.getAttribute('href') || '').replace(/\D/g, '');
      if (n.length >= 10) achados.add(n);
    }
    const texto = document.body.innerText || '';
    for (const m of texto.matchAll(/\(?\d{2}\)?[\s-]?9?\d{4}[-\s]?\d{4}/g)) {
      const n = m[0].replace(/\D/g, '');
      if (n.length === 10 || n.length === 11) achados.add(n);
    }
    return [...achados].slice(0, 6);
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
    throw new Error('nao achei o campo de anexo — abra a conversa do cliente');
  }

  async function anexarProximo() {
    const arquivos = dados?.arquivos || [];
    if (!arquivos.length) return;
    const a = arquivos[indiceAtual];
    status(`⏳ Anexando: ${a.nome}`);
    try {
      const file = await baixarComoArquivo(a.url, a.nome);
      const via = entregarAoChat(file);
      const restam = arquivos.length - indiceAtual - 1;
      const p = status(`✅ ${via.charAt(0).toUpperCase() + via.slice(1)}: ${a.nome}`, '#4ade80');
      if (restam > 0) {
        indiceAtual += 1;
        p.appendChild(botao(`📎 Envie essa e clique para a próxima (${restam})`, '#0e7490', anexarProximo));
      } else {
        indiceAtual = 0;
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
    p.appendChild(botao('📲 Enviar pelo WhatsApp', '#334155', enviarPeloWhatsApp));
  }

  async function verificar() {
    const tels = acharTelefones();
    const chave = tels.join(',');
    if (chave === ultimoTelefone) return; // mesma tela, ja avaliada
    ultimoTelefone = chave;

    if (!tels.length) {
      /* Antes o painel sumia aqui, e o Leo nao tinha como saber se o script
         estava vivo. Agora ele fala. */
      status('🦁 BRAVE: abra a conversa de um cliente (nao achei telefone nesta tela)');
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
    const fmt = tels.map((t) => t.slice(-8)).join(', ');
    status(`🦁 BRAVE: este contato ainda nao tem proposta pronta (final ${fmt})`);
  }

  // O SPA troca de contato sem recarregar: revalida periodicamente.
  verificar();
  setInterval(verificar, 3000);
})();
