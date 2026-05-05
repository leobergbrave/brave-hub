import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getBlingToken(supabase: any) {
  const { data, error } = await supabase.from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('Credenciais da Bling não encontradas no banco.');
  return data;
}

async function refreshBlingToken(supabase: any, config: any) {
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
  
  await supabase.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString()
  }).eq('id', 1);

  return tokenData.access_token;
}

async function fetchWithBlingAuth(url: string, options: any, supabase: any) {
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
    const { cliente, consultor, payload } = body;

    if (!payload || !payload.itens) {
      return new Response(JSON.stringify({ error: 'Payload de orçamento inválido' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const nomeCliente = cliente || 'Cliente Brave HUB';
    const nomeConsultor = consultor || 'Léo Berg';

    // 1. Buscar Vendedor (para preencher o ID obrigatório)
    let idVendedor = undefined;
    const resVend = await fetchWithBlingAuth('https://api.bling.com.br/v3/vendedores', { method: 'GET' }, supabaseClient);
    if (resVend.ok) {
      const vendData = await resVend.json();
      if (vendData && vendData.data) {
        const vendedor = vendData.data.find((v: any) => v.contato.nome.toLowerCase() === nomeConsultor.toLowerCase());
        if (vendedor) idVendedor = vendedor.id;
      }
    }
    
    await sleep(400); // Evitar rate limit (max 3 req/sec)

    // 2. Buscar ou Criar Contato
    let idContato = null;
    const resContBusca = await fetchWithBlingAuth(`https://api.bling.com.br/v3/contatos?pesquisa=${encodeURIComponent(nomeCliente)}`, { method: 'GET' }, supabaseClient);
    
    if (resContBusca.ok) {
      const contData = await resContBusca.json();
      if (contData && contData.data && contData.data.length > 0) {
        idContato = contData.data[0].id;
      }
    }

    await sleep(400);

    if (!idContato) {
      // Criar Contato
      const resContCria = await fetchWithBlingAuth('https://api.bling.com.br/v3/contatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeCliente,
          tipo: 'F', // F = Física, J = Jurídica (como padrão vamos de F)
          situacao: 'A',
          contribuinte: 9 // 9 = Não contribuinte
        })
      }, supabaseClient);

      if (resContCria.ok) {
        const newContData = await resContCria.json();
        if (newContData && newContData.data) {
          idContato = newContData.data.id;
        }
      } else {
        const errText = await resContCria.text();
        throw new Error(`Erro ao criar contato na Bling: ${errText}`);
      }
      await sleep(400);
    }

    if (!idContato) throw new Error('Não foi possível obter ou criar o contato na Bling.');

    // 3. Mapear os itens e criar Proposta Comercial
    const itensBling = payload.itens.map((item: any) => {
      // Como a proposta no Bling é geral, vamos enviar o preço base e aplicar o desconto total
      return {
        codigo: item.codigo_sku || '',
        descricao: item.nome,
        quantidade: item.quantidade,
        valor: Number(item.preco)
      };
    });

    const proposta: any = {
      contato: { id: idContato },
      itens: itensBling,
      transporte: {
        fretePorConta: 0, // 0 = Contratação do Frete por conta do Remetente (CIF)
        frete: Number(payload.frete) || 0
      }
    };

    if (idVendedor) {
      proposta.vendedor = { id: idVendedor };
    }

    const blingResponse = await fetchWithBlingAuth('https://api.bling.com.br/v3/propostas-comerciais', {
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
  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
