import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch'; // Vercel environment usually has fetch, but good practice

const supabaseClient = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

const BOTCONVERSA_WEBHOOK_URL = 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/tmoHVqIA0CRQ/';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body;
    
    // RD Station CRM Webhook Payload
    const deal = body.deal || body;
    if (!deal || !deal.id) {
      return res.status(400).json({ error: 'Nenhuma negociação (deal) encontrada no payload.' });
    }

    const rdDealId = deal.id || deal.deal_id || Math.random().toString(36).substring(7);
    const nome = deal.name || deal.deal_name || 'Lead RD';
    const statusNegociacao = deal.deal_stage?.name || 'Desconhecido';
    
    let telefone = '';
    if (deal.contacts && deal.contacts.length > 0) {
      const contact = deal.contacts[0];
      if (contact.phones && contact.phones.length > 0) {
        telefone = contact.phones[0].phone || '';
      }
    }
    
    let produtosInteresse = '';
    if (deal.deal_custom_fields && deal.deal_custom_fields.length > 0) {
       produtosInteresse = deal.deal_custom_fields.map((f) => `${f.custom_field?.name || 'Campo'}: ${f.value}`).join(', ');
    }

    // Salvar no Supabase
    const { data: leadData, error: dbError } = await supabaseClient
      .from('leads_crm')
      .upsert({
        rd_deal_id: String(rdDealId),
        nome,
        telefone,
        status_negociacao: statusNegociacao,
        produtos_interesse: produtosInteresse
      }, { onConflict: 'rd_deal_id' })
      .select()
      .single();

    if (dbError) {
      console.error('Erro ao salvar lead:', dbError);
      throw dbError;
    }

    // Enviar para BotConversa
    let botConversaRes = null;
    if (telefone) {
      // Limpa o telefone para garantir que vá apenas números (+55 já incluso se possível)
      let cleanPhone = telefone.replace(/\D/g, '');
      // Botconversa exige o formato 55 DDD NUMERO
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        cleanPhone = '55' + cleanPhone;
      }
      
      const bcResponse = await fetch(BOTCONVERSA_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nome: nome,
          telefone: cleanPhone,
          rd_deal_id: String(rdDealId),
          produtos_interesse: produtosInteresse,
          status: statusNegociacao
        })
      });
      
      botConversaRes = await bcResponse.text();
    }

    return res.status(200).json({ success: true, lead: leadData, botConversa: botConversaRes });
  } catch (error) {
    console.error('Erro na API Serverless:', error);
    return res.status(500).json({ error: error.message });
  }
}
