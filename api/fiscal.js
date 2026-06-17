import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

export default async function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send('Token é obrigatório');
  }

  // Busca dados do orçamento pelo token fiscal
  const { data: orc } = await supabase
    .from('orcamentos_salvos')
    .select('cliente, dados_fiscais_recebidos_em')
    .eq('formulario_fiscal_token', token)
    .maybeSingle();

  const nomeCliente = orc?.cliente || 'Cliente';
  const primeiroNome = nomeCliente.split(' ')[0];
  const jaPreenchido = !!orc?.dados_fiscais_recebidos_em;

  const baseUrl = `https://${req.headers.host}`;
  const redirectUrl = `${baseUrl}/formulario-fiscal/${token}`;
  const ogImageUrl = `${baseUrl}/og.png`;

  const titulo = jaPreenchido
    ? `Atualizar Dados Fiscais — ${primeiroNome}`
    : `Cadastro de Dados Fiscais — ${primeiroNome}`;

  const descricao = jaPreenchido
    ? `Atualize seus dados fiscais para emissão de nota fiscal pela Brave Fitness Equipment.`
    : `Preencha seus dados pessoais para emissão da sua nota fiscal. Pessoa Física ou Jurídica.`;

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${titulo}</title>

      <!-- Open Graph / WhatsApp / Facebook -->
      <meta property="og:title" content="${titulo}" />
      <meta property="og:description" content="${descricao}" />
      <meta property="og:image" content="${ogImageUrl}" />
      <meta property="og:url" content="${baseUrl}/fiscal/${token}" />
      <meta property="og:type" content="website" />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="Brave Fitness — Cadastro Fiscal" />
      <meta property="og:site_name" content="Brave Fitness Equipment" />

      <!-- Twitter Card -->
      <meta name="twitter:card" content="summary_large_image">
      <meta name="twitter:title" content="${titulo}">
      <meta name="twitter:description" content="${descricao}">
      <meta name="twitter:image" content="${ogImageUrl}">

      <!-- Redirect imediato para o app React -->
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
  res.setHeader('Cache-Control', 'no-store'); // Sem cache para dados fiscais
  res.status(200).send(html);
}
