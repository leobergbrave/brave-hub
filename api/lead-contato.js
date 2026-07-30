// api/lead-contato.js — dispara a 1ª mensagem de WhatsApp pro CLIENTE via BotConversa
// (número do Léo). Usado pelos canais: FSS (auto ao salvar orçamento) e Entrada
// Rápida (prints do Tiago). O conteúdo da mensagem é mapeado no fluxo do BotConversa;
// aqui só entregamos os campos: telefone, nome, origem, titulo, link, equipamentos.
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  // acao 'orcamento-adicionado': cliente adicionou produto na vitrine — alerta o
  // LÉO (não o cliente) pelo webhook do vigia. Fundido aqui pra não criar mais
  // uma função serverless (limite de funções do plano da Vercel).
  if (req.body?.acao === 'orcamento-adicionado') {
    const { slug, cliente, produto, valor, link } = req.body || {};
    if (!produto) return res.status(400).json({ ok: false, error: 'produto obrigatório' });
    const urlVigia = process.env.BOTCONVERSA_WEBHOOK
      || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/BKf6LUAsGAKO/';
    const telLeo = process.env.ALERTA_TELEFONE || '5548996459791';
    const valorTxt = Number(valor) > 0
      ? ` (${Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`
      : '';
    try {
      await fetch(urlVigia, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: telLeo,
          nome: cliente || 'Cliente',
          titulo: 'Cliente adicionou produto',
          qtd_pendentes: 1,
          link: link || '',
          alerta: `🛒🔥 ${cliente || 'Cliente'} ADICIONOU "${produto}"${valorTxt} ao próprio orçamento (${slug || ''})! Sinal de compra — chama agora: ${link || ''}`,
        }),
      });
    } catch (e) {
      return res.status(200).json({ ok: false, error: e.message });
    }
    return res.status(200).json({ ok: true });
  }

  const { telefone, nome, origem, titulo, link, equipamentos } = req.body || {};
  const tel = String(telefone || '').replace(/\D/g, '');
  if (tel.length < 10) return res.status(400).json({ ok: false, error: 'Telefone inválido (mínimo DDD + número)' });
  const telefoneFull = tel.startsWith('55') ? tel : '55' + tel;

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Automações de CONTATO no BotConversa (distintas do vigia, que avisa o Léo).
  // Roteamento por origem + presença de link:
  //   COM link (orçamento pronto): FSS → fluxo FSS; TIAGO → fluxo próprio (ou o
  //   do FSS enquanto não existir automação dedicada).
  //   SEM link (Entrada Rápida — orçamento vem depois): fluxo de {equipamentos}.
  const org = String(origem || '').toUpperCase();
  const temLink = !!(link && String(link).trim());
  const W_FSS_LINK   = 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/EPSbPfdggLNq/';
  const W_TIAGO_LINK = 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/3tZyKf8phu7S/';
  const W_SEM_LINK   = 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/CWJj5OpdIMpd/';
  let webhook = !temLink ? W_SEM_LINK : (org === 'TIAGO' ? W_TIAGO_LINK : W_FSS_LINK);
  try {
    const { data: cfg } = await supabase.from('prospeccao_config').select('*').eq('id', 1).maybeSingle();
    if (temLink && org === 'TIAGO' && cfg?.webhook_contato_tiago) webhook = cfg.webhook_contato_tiago;
    else if (temLink && cfg?.webhook_contato_fss) webhook = cfg.webhook_contato_fss;
    else if (!temLink && cfg?.webhook_contato) webhook = cfg.webhook_contato;
  } catch { /* colunas podem não existir */ }

  try {
    const r = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telefone: telefoneFull,
        nome: nome || 'Cliente',
        origem: origem || '',
        titulo: titulo || '',
        link: link || '',
        equipamentos: Array.isArray(equipamentos) ? equipamentos.join(', ') : (equipamentos || ''),
      }),
    });
    if (!r.ok) return res.status(200).json({ ok: false, error: `BotConversa respondeu ${r.status}` });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Falha ao chamar BotConversa: ' + e.message });
  }

  // registra o lead no funil (não trava a resposta se falhar)
  try {
    await supabase.from('leads').insert({
      nome: nome || 'Lead', telefone: telefoneFull, status: 'novo', origem_lead: origem || null,
    });
  } catch { /* ok */ }

  return res.status(200).json({ ok: true });
}
