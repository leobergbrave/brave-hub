import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

export default async function handler(req, res) {
  const { slug } = req.query;

  if (!slug) {
    return res.status(400).send('Slug is required');
  }

  // Fetch orcamento
  const { data: orcamento } = await supabase
    .from('orcamentos_salvos')
    .select('cliente')
    .eq('slug', slug)
    .single();

  const cliente = orcamento?.cliente || 'Cliente';
  
  // Apenas o primeiro nome ou abreviação para não quebrar a imagem
  const nomeCurto = cliente.split(' ').slice(0, 2).join(' ').substring(0, 30);
  const encodedClient = encodeURIComponent(nomeCurto);
  
  const baseUrl = `https://${req.headers.host}`;
  const ogImageUrl = `${baseUrl}/logo-orcamento.png`;
  const redirectUrl = `${baseUrl}/orcamento/${slug}`;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>BRAVE — Orçamento para ${nomeCurto}</title>
      
      <!-- Open Graph / WhatsApp / Facebook -->
      <meta property="og:title" content="Orçamento Exclusivo — ${nomeCurto}" />
      <meta property="og:description" content="Confira agora a proposta de equipamentos de alta performance preparada para você." />
      <meta property="og:image" content="${ogImageUrl}" />
      <meta property="og:type" content="website" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Orçamento BRAVE" />
      <meta property="og:site_name" content="Brave" />
      
      <!-- Twitter -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Orçamento Exclusivo — ${nomeCurto}">
      <meta name="twitter:description" content="Confira agora a proposta de equipamentos de alta performance preparada para você.">
      <meta name="twitter:image" content="${ogImageUrl}">

      <!-- Fallback Redirects -->
      <meta http-equiv="refresh" content="0; url=${redirectUrl}">
      <script>
        // Redireciona imediatamente sem deixar rastros no histórico do botão voltar
        window.location.replace("${redirectUrl}");
      </script>
      
      <style>
        body { background-color: #09090b; color: #fff; font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .loader { border: 4px solid #1c1c1c; border-top: 4px solid #f97316; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div style="text-align: center;">
        <div class="loader" style="margin: 0 auto 20px;"></div>
        <p>Abrindo orçamento seguro...</p>
        <p style="font-size: 12px; color: #666; margin-top: 10px;">Se não for redirecionado, <a href="${redirectUrl}" style="color: #f97316; text-decoration: none;">clique aqui</a>.</p>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Cache control for WhatsApp scrapers
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(html);
}
