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

  const { telefone, nome, origem, titulo, link, equipamentos } = req.body || {};
  const tel = String(telefone || '').replace(/\D/g, '');
  if (tel.length < 10) return res.status(400).json({ ok: false, error: 'Telefone inválido (mínimo DDD + número)' });
  const telefoneFull = tel.startsWith('55') ? tel : '55' + tel;

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // URL da automação de CONTATO no BotConversa (diferente da automação do vigia,
  // que avisa o Léo). Config/env podem sobrescrever a padrão.
  let webhook = process.env.BOTCONVERSA_CONTATO_WEBHOOK
    || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/CWJj5OpdIMpd/';
  try {
    const { data: cfg } = await supabase.from('prospeccao_config').select('*').eq('id', 1).maybeSingle();
    if (cfg?.webhook_contato) webhook = cfg.webhook_contato;
  } catch { /* coluna pode não existir ainda */ }

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
