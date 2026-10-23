// api/lead-contato.js — dispara a 1ª mensagem de WhatsApp pro CLIENTE pelo WAHA
// (número do Léo, mesma sessão do agente). Usado pela Entrada Rápida (prints do
// Tiago). O TEXTO da mensagem mora AQUI agora (antes vivia no fluxo visual da
// BotConversa). Também manda, por outra rota (acao=orcamento-adicionado), o alerta
// pro Léo quando o cliente adiciona produto na vitrine.
import { createClient } from '@supabase/supabase-js';
import { wahaConfigurado, wahaSendText } from './_waha.js';
import { verificarAdmin } from './_auth.js';

const HUB_ORIGEM = 'https://brave-hub-two.vercel.app';

// Limpa texto que vem do cliente antes de virar mensagem de WhatsApp: tira URLs
// (ninguém injeta link), tira caracteres de controle (mantém \n) e corta no tamanho.
function limparTexto(s, max = 400) {
  return String(s || '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ')
    .slice(0, max)
    .trim();
}
// Só mantém o link se for do próprio HUB (senão, risco de link malicioso no alerta).
function linkSeguro(url) {
  const s = String(url || '').trim();
  return s.startsWith(HUB_ORIGEM) ? s : '';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // acao 'orcamento-adicionado': cliente adicionou produto na vitrine — alerta o
  // LÉO (não o cliente) pelo webhook do vigia. Fundido aqui pra não criar mais
  // uma função serverless (limite de funções do plano da Vercel).
  if (req.body?.acao === 'orcamento-adicionado') {
    // Alerta pro LÉO (vitrine pública do cliente, sem login). O texto chega no
    // WhatsApp dele, então limpamos tudo que vem na requisição: cliente/produto
    // sem URL e cortados, slug só com [\w-], e o link só se for do HUB.
    const { produto, valor, telefone_cliente } = req.body || {};
    const prod = limparTexto(produto, 120).replace(/\n/g, ' ');
    if (!prod) return res.status(400).json({ ok: false, error: 'produto obrigatório' });
    const cli = (limparTexto(req.body?.cliente, 80).replace(/\n/g, ' ')) || 'Cliente';
    const slugLimpo = String(req.body?.slug || '').replace(/[^\w-]/g, '').slice(0, 40);
    const link = linkSeguro(req.body?.link);
    const telLeo = process.env.ALERTA_TELEFONE || '5548996459791';
    const valorTxt = Number(valor) > 0
      ? ` (${Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
      : '';
    const telClienteRaw = String(telefone_cliente || '').replace(/\D/g, '');
    const telClienteTxt = telClienteRaw.length >= 10
      ? `\n📱 WhatsApp: +${telClienteRaw}`
      : '\n📱 WhatsApp: não informado';
    const alerta = `🛒🔥 ${cli} ADICIONOU "${prod}"${valorTxt} ao próprio orçamento (${slugLimpo})!${telClienteTxt}\nSinal de compra, chama agora: ${link}`;
    try {
      if (wahaConfigurado()) await wahaSendText(telLeo, alerta);
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
    return res.status(200).json({ ok: true });
  }

  // Daqui pra baixo = 1ª mensagem da Entrada Rápida: manda WhatsApp pro CLIENTE
  // (número arbitrário) no número ao vivo. Exige ADMIN LOGADO (endpoint aberto +
  // repo público — sem isso, vira relay de spam).
  const admin = await verificarAdmin(req);
  if (!admin) return res.status(401).json({ ok: false, error: 'Precisa estar logado no admin pra disparar a mensagem.' });

  const { telefone, nome, origem, equipamentos } = req.body || {};
  const tel = String(telefone || '').replace(/\D/g, '');
  if (tel.length < 10) return res.status(400).json({ ok: false, error: 'Telefone inválido (mínimo DDD + número)' });
  const telefoneFull = tel.startsWith('55') ? tel : '55' + tel;

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  /* 1ª mensagem no WhatsApp do cliente, pelo WAHA (número do Léo). O texto mora
     AQUI (antes vivia no fluxo visual da BotConversa). Só o caso SEM orçamento
     (Entrada Rápida) manda esta mensagem; quando há orçamento, os PDFs vão pelo
     fluxo de proposta (despacharPdfs). Trata pelo PRIMEIRO nome, sem termo de
     gênero. equipamentos sai um por linha (como o cliente escreveu), limpo de
     URLs e cortado no tamanho. */
  if (!wahaConfigurado()) return res.status(500).json({ ok: false, error: 'WAHA não configurado na Vercel.' });
  const primeiroNome = (limparTexto(nome, 60).replace(/\n/g, ' ').trim().split(/\s+/)[0]) || 'Cliente';
  const equip = limparTexto(Array.isArray(equipamentos) ? equipamentos.join('\n') : equipamentos, 800);
  const mensagem = `Oi ${primeiroNome}, tudo bem? 👊\nAqui é o Léo, da BRAVE. Recebi seu contato.\n\nVi aqui o que você tá buscando:\n${equip}\n\ncerto?`;

  try {
    const r = await wahaSendText(telefoneFull, mensagem);
    if (!r.ok) return res.status(200).json({ ok: false, error: `WAHA recusou o envio (HTTP ${r.status}): ${String(r.texto).slice(0, 200)}` });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Falha ao enviar pelo WAHA: ' + e.message });
  }

  // registra o lead no funil (não trava a resposta se falhar)
  try {
    await supabase.from('leads').insert({
      nome: nome || 'Lead', telefone: telefoneFull, status: 'novo', origem_lead: origem || null,
    });
  } catch { /* ok */ }

  return res.status(200).json({ ok: true });
}
