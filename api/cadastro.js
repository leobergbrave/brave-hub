import { createClient } from '@supabase/supabase-js';

/**
 * GET /cadastro → serve HTML com OG tags corretas e redireciona para /formulario-cadastro
 * WhatsApp lê "Brave — Cadastro de Cliente" ao invés de "Orçamento Exclusivo"
 */
export default async function handler(req, res) {
  const baseUrl = `https://${req.headers.host}`;
  const redirectUrl = `${baseUrl}/formulario-cadastro`;
  const ogImageUrl = `${baseUrl}/og.png`;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Brave — Cadastro de Cliente</title>

      <!-- Open Graph / WhatsApp -->
      <meta property="og:title" content="Brave — Cadastro de Cliente" />
      <meta property="og:description" content="Cadastre seus dados para receber propostas e suporte da Brave Fitness Equipment." />
      <meta property="og:image" content="${ogImageUrl}" />
      <meta property="og:url" content="${baseUrl}/cadastro" />
      <meta property="og:type" content="website" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content="Brave Fitness Equipment" />

      <!-- Twitter Card -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="Brave — Cadastro de Cliente">
      <meta name="twitter:description" content="Cadastre seus dados para receber propostas e suporte da Brave Fitness Equipment.">
      <meta name="twitter:image" content="${ogImageUrl}">

      <meta http-equiv="refresh" content="0; url=${redirectUrl}">
      <script>window.location.replace("${redirectUrl}");</script>

      <style>
        body { background:#0a0a0a; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; font-family:sans-serif; }
        .loader { border:3px solid #27272a; border-top:3px solid #f97316; border-radius:50%; width:36px; height:36px; animation:spin 0.8s linear infinite; }
        @keyframes spin { to { transform:rotate(360deg); } }
      </style>
    </head>
    <body>
      <div style="text-align:center;">
        <div class="loader" style="margin:0 auto 16px;"></div>
        <p style="color:#d4d4d8;font-size:14px;">Abrindo formulário...</p>
        <p style="font-size:11px;color:#52525b;margin-top:8px;">Se não redirecionar, <a href="${redirectUrl}" style="color:#f97316;text-decoration:none;">clique aqui</a>.</p>
      </div>
    </body>
    </html>
  `;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(html);
}
