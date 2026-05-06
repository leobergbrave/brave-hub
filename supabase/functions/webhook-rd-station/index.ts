import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOTCONVERSA_WEBHOOK_URL = 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/tmoHVqIA0CRQ/';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    
    // RD Station CRM Webhook Payload
    const deal = body.deal || body;
    if (!deal) {
      return new Response(JSON.stringify({ error: 'Nenhuma negociação (deal) encontrada no payload.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
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
       produtosInteresse = deal.deal_custom_fields.map((f: any) => `${f.custom_field?.name || 'Campo'}: ${f.value}`).join(', ');
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
      // Botconversa geralmente exige o formato 55 DDD NUMERO
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

    return new Response(JSON.stringify({ success: true, lead: leadData, botConversa: botConversaRes }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (error: any) {
    console.error('Erro na Edge Function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
