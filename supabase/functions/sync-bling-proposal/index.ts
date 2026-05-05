import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function getBlingToken(supabase) {
  const { data, error } = await supabase.from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('Credenciais da Bling não encontradas no banco.');
  return data;
}

async function refreshBlingToken(supabase, config) {
  const credentials = btoa(`${config.client_id}:${config.client_secret}`);
  
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '1.0'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Erro ao atualizar token:', err);
    throw new Error('Falha ao renovar o token da Bling. O refresh_token pode ter expirado.');
  }

  const tokenData = await response.json();
  
  // Atualiza no banco
  await supabase.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString()
  }).eq('id', 1);

  return tokenData.access_token;
}

async function fetchWithBlingAuth(url, options, supabase) {
  let config = await getBlingToken(supabase);
  
  let res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${config.access_token}`,
      'Accept': '1.0'
    }
  });

  if (res.status === 401) {
    console.log('Token expirado. Tentando renovar...');
    const newAccessToken = await refreshBlingToken(supabase, config);
    res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${newAccessToken}`,
        'Accept': '1.0'
      }
    });
  }

  return res;
}

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
    const { cliente, payload } = body;

    if (!payload || !payload.itens) {
      return new Response(JSON.stringify({ error: 'Payload de orçamento inválido' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    // 1. Mapear os itens
    const itensBling = payload.itens.map(item => {
      // Usar preco_avista se estiver disponível no payload (se for à vista), senão preco normal
      // Como a proposta no Bling é geral, vamos enviar o preço base e aplicar o desconto total
      return {
        codigo: item.codigo_sku || '',
        descricao: item.nome,
        quantidade: item.quantidade,
        valor: item.preco
      };
    });

    // 2. Montar Proposta Comercial
    const proposta = {
      contato: {
        nome: cliente || 'Cliente Brave HUB'
      },
      itens: itensBling,
      transporte: {
        fretePorConta: 0, // 0 = Contratação do Frete por conta do Remetente (CIF)
        frete: Number(payload.frete) || 0
      }
    };

    // 3. Enviar para a Bling
    const blingResponse = await fetchWithBlingAuth('https://www.bling.com.br/Api/v3/propostas-comerciais', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(proposta)
    }, supabaseClient);

    const responseText = await blingResponse.text();
    console.log('Bling Response Status:', blingResponse.status);
    console.log('Bling Response Body:', responseText);

    if (!blingResponse.ok) {
      throw new Error(`Erro na Bling: ${responseText}`);
    }

    return new Response(JSON.stringify({ success: true, data: JSON.parse(responseText) }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
