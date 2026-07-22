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
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refresh_token })
  });
  if (!response.ok) throw new Error('Falha ao renovar token da Bling');
  const tokenData = await response.json();
  await supabase.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString()
  }).eq('id', 1);
  return tokenData.access_token;
}

async function fetchBling(url: string, supabase: any, tokenRef: { token: string }) {
  let res = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${tokenRef.token}`, 'Accept': '1.0' }
  });
  if (res.status === 401) {
    const config = await getBlingToken(supabase);
    tokenRef.token = await refreshBlingToken(supabase, config);
    res = await fetch(url, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${tokenRef.token}`, 'Accept': '1.0' }
    });
  }
  return res;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const config = await getBlingToken(supabase);
    const tokenRef = { token: config.access_token };

    let body: any = {};
    try { body = await req.json(); } catch { /* ok */ }
    const modo = body?.modo || 'sync';
    const pagina = body?.pagina || 1; // Permite chamar uma página específica

    // ══════════════════════════════════════
    // MODO PESOS: busca peso individual
    // ══════════════════════════════════════
    if (modo === 'pesos') {
      const { data: semPeso } = await supabase
        .from('produtos')
        .select('id, bling_id')
        .not('bling_id', 'is', null)
        .or('peso_kg.is.null,peso_kg.eq.0')
        .limit(30); // Processa 30 por vez para não estourar timeout

      if (!semPeso || semPeso.length === 0) {
        return new Response(JSON.stringify({ success: true, message: 'Todos os produtos já têm peso!', restantes: 0 }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      let atualizados = 0;
      for (let i = 0; i < semPeso.length; i++) {
        const prod = semPeso[i];
        try {
          const res = await fetchBling(`https://api.bling.com.br/v3/produtos/${prod.bling_id}`, supabase, tokenRef);
          if (res.ok) {
            const json = await res.json();
            const d = json.data;
            const peso = Number(d.pesoBruto) || Number(d.pesoLiquido) || 0;
            if (peso > 0) {
              await supabase.from('produtos').update({ peso_kg: peso }).eq('id', prod.id);
              atualizados++;
            }
          }
        } catch (err) {
          console.warn(`Erro peso bling_id ${prod.bling_id}:`, err);
        }
        if ((i + 1) % 3 === 0) await sleep(1100);
      }

      // Contar quantos ainda faltam
      const { count } = await supabase
        .from('produtos')
        .select('id', { count: 'exact', head: true })
        .not('bling_id', 'is', null)
        .or('peso_kg.is.null,peso_kg.eq.0');

      return new Response(JSON.stringify({ 
        success: true, 
        atualizados, 
        restantes: count || 0,
        message: `${atualizados} pesos atualizados. ${count || 0} produtos ainda sem peso.`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // ══════════════════════════════════════
    // MODO SYNC: Listagem rápida por página
    // ══════════════════════════════════════
    const limit = 100;
    const url = `https://api.bling.com.br/v3/produtos?pagina=${pagina}&limite=${limit}&criterio=5&tipo=P`;
    
    console.log(`Buscando página ${pagina} da Bling...`);
    const res = await fetchBling(url, supabase, tokenRef);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro na Bling página ${pagina}: ${errText}`);
    }

    const json = await res.json();
    const blingProducts = json.data || [];
    
    console.log(`Página ${pagina}: ${blingProducts.length} produtos`);

    if (blingProducts.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, pagina, total: 0, temMais: false,
        message: `Página ${pagina} vazia. Sincronização completa!`
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Buscar produtos locais para match
    const { data: localProducts } = await supabase.from('produtos').select('id, codigo_sku, bling_id');

    const blingIdMap = new Map<number, string>();
    const skuMap = new Map<string, string>();
    if (localProducts) {
      for (const lp of localProducts) {
        if (lp.bling_id) blingIdMap.set(lp.bling_id, lp.id);
        if (lp.codigo_sku) skuMap.set(lp.codigo_sku.toUpperCase().trim(), lp.id);
      }
    }

    let updated = 0, inserted = 0, skipped = 0;

    // Monta os lotes primeiro. Antes isso fazia ate 100 chamadas sequenciais ao banco
    // por pagina (uma por produto), o que estourava o tempo da edge function e fazia o
    // runtime abortar com um erro em texto puro ("An error o...") em vez de JSON.
    // Agora sao 2 chamadas por pagina.
    const paraAtualizar: any[] = [];
    const paraInserir: any[] = [];

    for (const bp of blingProducts) {
      const blingId = bp.id;
      const sku = (bp.codigo || '').trim();
      const localId = blingIdMap.get(blingId) || (sku ? skuMap.get(sku.toUpperCase()) : null);

      if (localId) {
        paraAtualizar.push({ id: localId, bling_id: blingId, ...(sku ? { codigo_sku: sku } : {}) });
      } else {
        paraInserir.push({
          bling_id: blingId,
          codigo_sku: sku,
          nome: bp.nome || '',
          preco: Number(bp.preco) || 0,
        });
      }
    }

    if (paraAtualizar.length) {
      const { error } = await supabase.from('produtos').upsert(paraAtualizar, { onConflict: 'id' });
      if (error) { console.error('Erro no update em lote:', error); skipped += paraAtualizar.length; }
      else updated = paraAtualizar.length;
    }

    if (paraInserir.length) {
      const { error } = await supabase.from('produtos').insert(paraInserir);
      if (error) { console.error('Erro no insert em lote:', error); skipped += paraInserir.length; }
      else inserted = paraInserir.length;
    }

    const temMais = blingProducts.length >= limit;

    // Se tem mais páginas, chama a si mesmo automaticamente para a próxima
    if (temMais) {
      // Faltava o Authorization (a auto-chamada tomava 401) e o waitUntil — sem ele o
      // runtime mata o isolate ao devolver a resposta e a chamada nem sai. Resultado:
      // a sincronizacao parava na pagina 1 sem avisar.
      const selfUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/sync-bling-products`;
      const proxima = fetch(selfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({ modo: 'sync', pagina: pagina + 1 })
      }).catch(err => console.error('Erro ao chamar próxima página:', err));

      // @ts-ignore EdgeRuntime existe no runtime do Supabase
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(proxima);
    }

    return new Response(JSON.stringify({
      success: true,
      pagina,
      nesta_pagina: blingProducts.length,
      atualizados: updated,
      novos: inserted,
      ignorados: skipped,
      temMais,
      message: `Página ${pagina}: ${updated} atualizados, ${inserted} novos.${temMais ? ` Próxima página (${pagina + 1}) será processada automaticamente...` : ' Última página!'}`
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Erro:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
