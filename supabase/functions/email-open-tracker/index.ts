import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 1×1 transparent GIF
const PIXEL = new Uint8Array([
  71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,1,68,0,59
]);

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const emailId = url.searchParams.get('id');

  if (emailId) {
    try {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      await supabase
        .from('emails_enviados')
        .update({ aberto: true, aberto_em: new Date().toISOString() })
        .eq('id', emailId)
        .eq('aberto', false);
    } catch (err) {
      console.error('Erro ao registrar abertura:', err);
    }
  }

  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
