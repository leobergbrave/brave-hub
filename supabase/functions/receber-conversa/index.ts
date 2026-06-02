import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    // BotConversa envia diferentes formatos — normalizamos aqui
    const telefone = (body.phone || body.telefone || body.subscriber?.phone || '').replace(/\D/g, '');
    const mensagem = body.message || body.mensagem || body.text || '';
    const direcao  = (body.type === 'incoming' || body.direction === 'received' || body.direcao === 'recebida')
      ? 'recebida'
      : 'enviada';

    if (!telefone || !mensagem) {
      return new Response('ok', { status: 200, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    await supabase.from('conversas').insert({ telefone, mensagem, direcao });

    return new Response('ok', { status: 200, headers: corsHeaders });
  } catch (err: any) {
    // Retorna 200 para o BotConversa não tentar reenviar
    console.error('Erro receber-conversa:', err.message);
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
});
