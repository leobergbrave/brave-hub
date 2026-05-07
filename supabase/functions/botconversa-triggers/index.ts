import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Configuração das URLs de Webhook do BotConversa
// Lembre-se de definir estas variáveis de ambiente no seu painel do Supabase!
// BOTCONVERSA_WEBHOOK_CEP
// BOTCONVERSA_WEBHOOK_ABANDONO

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Trata a requisição de pré-verificação (CORS) do navegador
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Inicializa o cliente Supabase com a chave de serviço (bypass RLS)
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { evento, codigo_link, cep_info } = await req.json();

    // ==========================================
    // 1. GATILHO: CEP CALCULADO
    // ==========================================
    if (evento === 'cep_calculado') {
      const { data: linkData, error: linkError } = await supabaseClient
        .from('links_rapidos')
        .select('telefone_lead, nome_lead, produtos_texto')
        .eq('codigo', codigo_link)
        .single();

      if (linkError || !linkData || !linkData.telefone_lead) {
        return new Response(JSON.stringify({ error: 'Link não encontrado ou sem telefone configurado' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const webhookUrl = Deno.env.get('BOTCONVERSA_WEBHOOK_CEP') || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/khASXU0abK3M/';
      if (webhookUrl) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            telefone: linkData.telefone_lead,
            nome: linkData.nome_lead,
            produtos: linkData.produtos_texto,
            cep_cidade: cep_info?.localidade,
            cep_estado: cep_info?.uf
          })
        });
      }

      // Marca como aberto e cancela o gatilho de abandono definitivamente
      await supabaseClient
        .from('links_rapidos')
        .update({ aberto: true, alerta_abandono_enviado: true })
        .eq('codigo', codigo_link);

      return new Response(JSON.stringify({ success: true, message: 'Webhook de CEP enviado e abandono cancelado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ==========================================
    // 2. GATILHO: ABANDONO (VERIFICAÇÃO DE 15 MINUTOS)
    // ==========================================
    if (evento === 'verificar_abandonos') {
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      
      const { data: abandonos, error: fetchError } = await supabaseClient
        .from('links_rapidos')
        .select('id, telefone_lead, nome_lead, produtos_texto')
        .eq('aberto', false)
        .eq('alerta_abandono_enviado', false)
        .not('telefone_lead', 'is', null) // Só manda mensagem se o lead tiver telefone
        .lt('criado_em', fifteenMinsAgo);

      if (fetchError || !abandonos || abandonos.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'Nenhum abandono pendente' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const webhookUrl = Deno.env.get('BOTCONVERSA_WEBHOOK_ABANDONO') || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/QRvsDhJ18g5P/';
      let processados = 0;

      for (const lead of abandonos) {
        // Double-check: re-verifica se o lead continua sem abrir (evita race condition)
        const { data: recheck } = await supabaseClient
          .from('links_rapidos')
          .select('aberto, alerta_abandono_enviado')
          .eq('id', lead.id)
          .single();

        if (recheck?.aberto || recheck?.alerta_abandono_enviado) {
          // Lead já abriu ou já recebeu alerta — pula
          continue;
        }

        // Trava de segurança imediata: marca como enviado ANTES de fazer a requisição externa
        const { error: updateError } = await supabaseClient
          .from('links_rapidos')
          .update({ alerta_abandono_enviado: true })
          .eq('id', lead.id);

        if (!updateError && webhookUrl) {
          await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              telefone: lead.telefone_lead,
              nome: lead.nome_lead,
              produtos: lead.produtos_texto
            })
          }).catch(err => console.error('Erro na requisição pro BotConversa:', err));
          
          processados++;
        }
      }

      return new Response(JSON.stringify({ success: true, message: `${processados} gatilhos de abandono enviados` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Evento inválido' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
