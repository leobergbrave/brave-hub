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
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    // 1. Buscar Vendedor
    let idVendedor = undefined;
    const resVend = await fetchWithBlingAuth('https://api.bling.com.br/v3/vendedores', { method: 'GET' }, supabaseClient);
    if (resVend.ok) {
      const vendData = await resVend.json();
      if (vendData && vendData.data) {
        const vendedor = vendData.data.find((v: any) => normalize(v.contato.nome) === normalize(nomeConsultor));
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

    if (!idContato) throw new Error('Falha ao criar contato.');

    const descAvista = payload.condicoes?.descontoAvista || 0;
    const descCartao = payload.condicoes?.descontoCartao || 0;

    // 3. Buscar bling_ids dos produtos locais
    const produtoIds = payload.itens.map((item: any) => item.id).filter(Boolean);
    const { data: localProducts } = await supabaseClient
      .from('produtos')
      .select('id, bling_id, codigo_sku')
      .in('id', produtoIds);

    // Map: local UUID → bling_id
    const blingIdMap = new Map<string, number>();
    if (localProducts) {
      for (const lp of localProducts) {
        if (lp.bling_id) blingIdMap.set(lp.id, lp.bling_id);
      }
    }

    // 4. Montar itens para a Proposta À VISTA
    const itensAvista = payload.itens.map((item: any) => {
      const precoFinalAvista = item.preco_avista != null ? item.preco_avista : item.preco * (1 - descAvista / 100);
      const blingId = blingIdMap.get(item.id);
      return {
        codigo: item.codigo_sku || '',
        descricao: item.nome,
        descricaoDetalhada: item.nome,
        unidade: 'UN',
        quantidade: item.quantidade,
        valor: Number(precoFinalAvista.toFixed(2)),
        // Se temos o bling_id, vincula ao produto REAL. Senão, cai como texto livre (fallback).
        ...(blingId ? { produto: { id: blingId } } : { produto: { descricao: item.nome } })
      };
    });

    // 5. Montar itens para a Proposta A PRAZO
    const itensPrazo = payload.itens.map((item: any) => {
      const precoFinalPrazo = item.preco_prazo != null ? item.preco_prazo : item.preco * (1 - descCartao / 100);
      const blingId = blingIdMap.get(item.id);
      return {
        codigo: item.codigo_sku || '',
        descricao: item.nome,
        descricaoDetalhada: item.nome,
        unidade: 'UN',
        quantidade: item.quantidade,
        valor: Number(precoFinalPrazo.toFixed(2)),
        ...(blingId ? { produto: { id: blingId } } : { produto: { descricao: item.nome } })
      };
    });

    const propostaBase: any = {
      contato: { id: idContato },
      transporte: {
        fretePorConta: 0,
        frete: Number(payload.frete) || 0
      }
    };
    if (idVendedor) {
      propostaBase.vendedor = { id: idVendedor };
    }

    const propostaAvista = { ...propostaBase, itens: itensAvista, observacaoInterna: 'Proposta gerada automaticamente: Valores À VISTA' };
    const propostaPrazo = { ...propostaBase, itens: itensPrazo, observacaoInterna: `Proposta gerada automaticamente: Valores A PRAZO (${payload.condicoes?.parcelas || '12'}x)` };

    // Envia Proposta À Vista
    const blingResAvista = await fetchWithBlingAuth('https://api.bling.com.br/v3/propostas-comerciais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(propostaAvista)
    }, supabaseClient);

    if (!blingResAvista.ok) {
      const err = await blingResAvista.text();
      throw new Error(`Erro na Bling (Proposta À Vista): ${err}`);
    }
    const dataAvista = await blingResAvista.json();

    await sleep(400);

    // Envia Proposta A Prazo
    const blingResPrazo = await fetchWithBlingAuth('https://api.bling.com.br/v3/propostas-comerciais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(propostaPrazo)
    }, supabaseClient);

    if (!blingResPrazo.ok) {
      const err = await blingResPrazo.text();
      throw new Error(`Erro na Bling (Proposta A Prazo): ${err}`);
    }
    const dataPrazo = await blingResPrazo.json();

    return new Response(JSON.stringify({ success: true, dataAvista, dataPrazo }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
