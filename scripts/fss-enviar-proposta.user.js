// ==UserScript==
// @name         Brave HUB — Enviar proposta pelo FSS
// @namespace    bravefitness.com.br
// @version      1.0
// @description  Botão na tela do contato do FSS que manda os PDFs oficiais da proposta no WhatsApp do cliente.
// @match        https://app.fullsalessystem.com/v2/location/*/contacts/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

/*
 * Por que existe: a diretoria exige que o cliente receba o PDF oficial do Bling,
 * e o Léo atende os leads dentro do FSS. Sem isso ele teria que sair do FSS,
 * achar o orçamento no HUB e só então enviar.
 *
 * Como acha o contato: o FSS é um SPA e não expõe o telefone num lugar estável,
 * então lemos o link "tel:" da tela (ver acharTelefone). O casamento com o
 * orçamento é feito no servidor pelos 8 últimos dígitos — DDI e nono dígito
 * entram e saem conforme a origem do lead.
 *
 * Não use console.log para acompanhar: o FSS injeta `debugger` em loop para
 * travar quem abre o DevTools. Por isso o próprio botão mostra o estado.
 */

(function () {
  'use strict';

  const HUB = 'https://brave-hub-two.vercel.app';
  const ID = 'brave-hub-enviar-proposta';
  let ultimoTelefone = null;

  function acharTelefone() {
    // 1) link de discagem é o mais confiável
    const tel = document.querySelector('a[href^="tel:"]');
    if (tel) {
      const n = tel.getAttribute('href').replace(/\D/g, '');
      if (n.length >= 10) return n;
    }
    // 2) fallback: primeiro telefone brasileiro visível na coluna do contato
    const m = (document.body.innerText || '').match(/\+?55?\s?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/);
    return m ? m[0].replace(/\D/g, '') : null;
  }

  function criarBotao() {
    let el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('button');
    el.id = ID;
    el.type = 'button';
    el.style.cssText = [
      'position:fixed', 'bottom:20px', 'right:20px', 'z-index:2147483647',
      'background:#0e7490', 'color:#fff', 'border:none', 'border-radius:10px',
      'padding:12px 18px', 'font:600 13px/1.3 system-ui,sans-serif',
      'box-shadow:0 4px 16px rgba(0,0,0,.3)', 'cursor:pointer', 'max-width:320px',
      'text-align:left',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  const setBtn = (texto, cor, ativo) => {
    const b = criarBotao();
    b.textContent = texto;
    b.style.background = cor;
    b.style.cursor = ativo ? 'pointer' : 'default';
    b.disabled = !ativo;
  };

  async function enviar(slug, cliente) {
    setBtn('⏳ Enviando PDFs...', '#57534e', false);
    try {
      const r = await fetch(`${HUB}/api/bling?acao=enviar_pdf_cliente`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      const j = await r.json();
      if (j.ok) setBtn(`✅ Proposta enviada para ${cliente}`, '#15803d', false);
      else setBtn(`❌ ${j.error || 'falhou'} — clique pra tentar de novo`, '#991b1b', true);
    } catch (e) {
      setBtn(`❌ Falha de rede — clique pra tentar de novo`, '#991b1b', true);
    }
  }

  async function verificar() {
    const tel = acharTelefone();
    if (!tel) {
      const b = document.getElementById(ID);
      if (b) b.remove();
      ultimoTelefone = null;
      return;
    }
    if (tel === ultimoTelefone) return; // já avaliado para este contato
    ultimoTelefone = tel;

    setBtn('⏳ Consultando proposta...', '#57534e', false);
    try {
      const r = await fetch(`${HUB}/api/bling?acao=proposta_por_telefone&telefone=${tel}`);
      const j = await r.json();
      if (!j.encontrado) {
        setBtn('Sem proposta pronta para este contato', '#44403c', false);
        return;
      }
      const jaFoi = j.enviadoEm
        ? ` (já enviada em ${new Date(j.enviadoEm).toLocaleDateString('pt-BR')})`
        : '';
      const b = criarBotao();
      setBtn(`📤 Enviar proposta para ${j.cliente}${jaFoi}`, jaFoi ? '#0f766e' : '#0e7490', true);
      b.onclick = () => enviar(j.slug, j.cliente);
    } catch (e) {
      setBtn('❌ Não consegui falar com o HUB', '#991b1b', false);
    }
  }

  // O SPA troca de contato sem recarregar a página: revalida periodicamente.
  verificar();
  setInterval(verificar, 3000);
})();
