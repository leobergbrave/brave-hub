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

  // Busca o nome do cliente no Supabase
  const { data: orcamento } = await supabase
    .from('orcamentos_salvos')
    .select('cliente')
    .eq('slug', slug)
    .single();

  const cliente = orcamento?.cliente || 'Cliente';

  // Primeiro nome em maiúsculas para o preview do WhatsApp
  const nomeCurto = cliente.split(' ')[0].toUpperCase();

  const baseUrl = `https://${req.headers.host}`;
  const ogImageUrl = `${baseUrl}/logo-orcamento.png`;
  const redirectUrl = `${baseUrl}/orcamento/${slug}`;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Orçamento Exclusivo — ${nomeCurto}</title>

      <!-- Open Graph / WhatsApp / Facebook -->
      <meta property="og:title" content="Orçamento Exclusivo — ${nomeCurto}" />
      <meta property="og:description" content="Confira agora a proposta de equipamentos de alta performance preparada para você." />
      <meta property="og:image" content="${ogImageUrl}" />
      <meta property="og:url" content="${baseUrl}/proposta/${slug}" />
      <meta property="og:type" content="website" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Orçamento BRAVE" />
      <meta property="og:site_name" content="Brave Fitness" />

      <!-- Twitter Card -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Orçamento Exclusivo — ${nomeCurto}">
      <meta name="twitter:description" content="Confira agora a proposta de equipamentos de alta performance preparada para você.">
      <meta name="twitter:image" content="${ogImageUrl}">

      <!-- Redirect imediato para o app React -->
      <meta http-equiv="refresh" content="0; url=${redirectUrl}">
      <script>window.location.replace("${redirectUrl}");</script>

      <style>
        body { background:#fff; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; font-family:sans-serif; }
        .loader { border:3px solid #e5e7eb; border-top:3px solid #059669; border-radius:50%; width:36px; height:36px; animation:spin 0.8s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      </style>
    </head>
    <body>
      <div style="text-align:center;">
        <div class="loader" style="margin:0 auto 16px;"></div>
        <p style="color:#374151;font-size:14px;">Abrindo proposta...</p>
        <p style="font-size:11px;color:#9ca3af;margin-top:8px;">Se não redirecionar, <a href="${redirectUrl}" style="color:#059669;text-decoration:none;">clique aqui</a>.</p>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  res.status(200).send(html);
}
