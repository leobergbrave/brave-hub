import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getBlingToken(supabase: any) {
  const { data, error } = await supabase.from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('Credenciais da Bling não encontradas.');
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Lê { paginas: N } do body — padrão 1 (= 10 produtos, comportamento original)
    let paginas = 1;
    try {
      const body = await req.json();
      if (body?.paginas && Number.isInteger(body.paginas) && body.paginas > 0) {
        paginas = Math.min(body.paginas, 5); // máximo 5 páginas (50 produtos) por chamada
      }
    } catch (_) { /* sem body = usa padrão */ }

    const limite = paginas * 10;

    const config = await getBlingToken(supabase);
    const tokenRef = { token: config.access_token };

    // Buscar produtos que têm bling_id mas não têm imagem
    const { data: semImagem } = await supabase
      .from('produtos')
      .select('id, bling_id, nome, codigo_sku')
      .not('bling_id', 'is', null)
      .or('url_imagem.is.null,url_imagem.eq.')
      .limit(limite);

    if (!semImagem || semImagem.length === 0) {
      // Contar total
      const { count } = await supabase
        .from('produtos')
        .select('id', { count: 'exact', head: true })
        .not('url_imagem', 'is', null)
        .neq('url_imagem', '');

      return new Response(JSON.stringify({ 
        success: true, 
        message: `Todos os produtos já têm imagem! (${count} com foto)`,
        restantes: 0,
        atualizados: 0
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let atualizados = 0;
    let erros = 0;
    const detalhes: string[] = [];

    for (let i = 0; i < semImagem.length; i++) {
      const prod = semImagem[i];
      try {
        // 1. Buscar detalhes do produto na Bling (inclui imagens)
        const res = await fetchBling(
          `https://api.bling.com.br/v3/produtos/${prod.bling_id}`,
          supabase, tokenRef
        );

        if (!res.ok) {
          detalhes.push(`❌ ${prod.nome}: erro ao buscar na Bling`);
          erros++;
          continue;
        }

        const json = await res.json();
        const prodBling = json.data;

        // 2. Encontrar a URL da imagem na resposta da Bling
        // A Bling v3 retorna imagens em: midia.imagens.externas[].link ou midia.imagens.internas[].link
        let imageUrl = '';

        if (prodBling.midia?.imagens?.externas?.length > 0) {
          imageUrl = prodBling.midia.imagens.externas[0].link;
        } else if (prodBling.midia?.imagens?.internas?.length > 0) {
          imageUrl = prodBling.midia.imagens.internas[0].link;
        } else if (prodBling.imagemURL) {
          imageUrl = prodBling.imagemURL;
        }

        if (!imageUrl) {
          // Marca como "sem foto na Bling" para não tentar novamente
          await supabase.from('produtos').update({ url_imagem: 'SEM_FOTO_BLING' }).eq('id', prod.id);
          detalhes.push(`⚠️ ${prod.nome}: sem imagem na Bling (marcado)`);
          erros++;
          continue;
        }

        // 3. Download da imagem
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) {
          detalhes.push(`❌ ${prod.nome}: falha ao baixar imagem`);
          erros++;
          continue;
        }

        const imgBlob = await imgRes.blob();
        const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
        
        // Determinar extensão
        let ext = 'jpg';
        if (contentType.includes('png')) ext = 'png';
        else if (contentType.includes('webp')) ext = 'webp';

        // 4. Gerar nome único e fazer upload para o Supabase Storage
        const sku = (prod.codigo_sku || '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        const fileName = `bling_${sku || prod.bling_id}_${Date.now()}.${ext}`;

        const imgBuffer = new Uint8Array(await imgBlob.arrayBuffer());

        const { error: uploadError } = await supabase.storage
          .from('produtos_media')
          .upload(fileName, imgBuffer, {
            contentType: contentType,
            upsert: true
          });

        if (uploadError) {
          detalhes.push(`❌ ${prod.nome}: erro no upload: ${uploadError.message}`);
          erros++;
          continue;
        }

        // 5. Pegar URL pública
        const { data: publicUrlData } = supabase.storage
          .from('produtos_media')
          .getPublicUrl(fileName);

        const publicUrl = publicUrlData.publicUrl;

        // 6. Atualizar o produto no banco
        const { error: updateError } = await supabase
          .from('produtos')
          .update({ url_imagem: publicUrl })
          .eq('id', prod.id);

        if (!updateError) {
          atualizados++;
          detalhes.push(`✅ ${prod.nome}`);
        } else {
          detalhes.push(`❌ ${prod.nome}: erro ao salvar URL: ${updateError.message}`);
          erros++;
        }

      } catch (err: any) {
        detalhes.push(`❌ ${prod.nome}: ${err.message}`);
        erros++;
      }

      // Rate limit da Bling (3 req/s)
      if ((i + 1) % 3 === 0) await sleep(1100);
    }

    // Contar quantos ainda faltam
    const { count: restantes } = await supabase
      .from('produtos')
      .select('id', { count: 'exact', head: true })
      .not('bling_id', 'is', null)
      .or('url_imagem.is.null,url_imagem.eq.');

    return new Response(JSON.stringify({
      success: true,
      atualizados,
      erros,
      restantes: restantes || 0,
      detalhes,
      message: `${atualizados} fotos importadas, ${erros} erros. ${restantes || 0} produtos ainda sem foto.`
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
