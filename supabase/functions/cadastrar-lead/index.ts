import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { nome, telefone, email, momento_compra, produtos_interesse, consultor, observacoes } = await req.json();

    if (!nome || !telefone || !produtos_interesse?.length) {
      return new Response(JSON.stringify({ error: 'nome, telefone e produtos_interesse são obrigatórios' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    // 1. Gera um link_rapido para este lead
    const codigo = Math.random().toString(36).substring(2, 8);
    const telefoneLimpo = telefone.replace(/\D/g, '');
    const telefoneFormatado = telefoneLimpo.length === 10 || telefoneLimpo.length === 11
      ? '55' + telefoneLimpo
      : telefoneLimpo;

    const { error: linkError } = await supabase.from('links_rapidos').insert({
      codigo,
      produtos_texto: produtos_interesse.join(','),
      nome_lead: nome,
      telefone_lead: telefoneFormatado,
      aberto: false,
      alerta_abandono_enviado: false,
    });

    if (linkError) throw new Error('Erro ao criar link rápido: ' + linkError.message);

    // 2. Salva o lead
    const { data: leadData, error: leadError } = await supabase.from('leads').insert({
      nome,
      telefone: telefoneFormatado,
      email: email || null,
      momento_compra: momento_compra || 'morno',
      produtos_interesse,
      status: 'novo',
      consultor: consultor || 'Léo Berg',
      observacoes: observacoes || null,
      link_rapido_codigo: codigo,
    }).select().single();

    if (leadError) throw new Error('Erro ao salvar lead: ' + leadError.message);

    // 3. Dispara o fluxo no BotConversa via webhook
    const webhookUrl = Deno.env.get('BOTCONVERSA_WEBHOOK_NOVO_LEAD');
    if (webhookUrl) {
      const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://brave-hub-two.vercel.app';
      const linkOrcamento = `${baseUrl}/q/${codigo}`;

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: telefoneFormatado,
          nome,
          produtos: produtos_interesse.join(', '),
          momento: momento_compra,
          link: linkOrcamento,
          consultor: consultor || 'Léo Berg',
        }),
      }).catch(err => console.error('Erro ao disparar webhook BotConversa:', err));

      // Atualiza status para fluxo_disparado
      await supabase.from('leads').update({ status: 'fluxo_disparado' }).eq('id', leadData.id);
      leadData.status = 'fluxo_disparado';
    }

    return new Response(JSON.stringify({ success: true, lead: leadData, codigo }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
