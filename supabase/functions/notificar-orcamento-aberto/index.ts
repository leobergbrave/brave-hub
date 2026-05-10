const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { slug } = await req.json();
    if (!slug) throw new Error('slug é obrigatório');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Busca o orçamento e checa se já foi marcado como aberto
    const { data: orc, error } = await supabase
      .from('orcamentos_salvos')
      .select('id, aberto, cliente, payload')
      .eq('slug', slug)
      .single();

    if (error || !orc) throw new Error('Orçamento não encontrado');

    // Já foi aberto antes — não dispara de novo
    if (orc.aberto) {
      return new Response(JSON.stringify({ success: true, skipped: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Marca como aberto
    await supabase
      .from('orcamentos_salvos')
      .update({ aberto: true })
      .eq('id', orc.id);

    // Monta payload para o BotConversa
    const telefone = orc.payload?.telefoneCliente || '';
    const nome = orc.cliente || '';
    const link = `https://brave-hub-two.vercel.app/orcamento/${slug}`;
    const produtos = (orc.payload?.itens || [])
      .map((i: any) => `${i.quantidade}x ${i.nome}`)
      .join(', ');

    const webhookUrl = Deno.env.get('BOTCONVERSA_WEBHOOK_ORCAMENTO_ABERTO');
    if (webhookUrl && telefone) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone, nome, link, produtos }),
      }).catch(err => console.error('Erro no webhook BotConversa:', err));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Erro notificar-orcamento-aberto:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
