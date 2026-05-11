import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EQUIPAMENTOS: Record<string, string> = {
  bikeerg: 'Bike Erg',
  remo:    'Remo Indoor',
  skierg:  'Ski Erg',
  storm:   'Storm Bike',
  estcv:   'Esteira Curva',
  escada:  'Escada',
};

function buildEmailHtml(nome: string, produtos: string[], consultor: string, momento: string): string {
  const primeiroNome = nome.split(' ')[0];
  const listaProdutos = produtos
    .map(p => `<li style="margin:6px 0;color:#d4d4d8;">${EQUIPAMENTOS[p] || p}</li>`)
    .join('');

  const whatsappConsultor = 'https://wa.me/5531973446109';
  const momentoTexto: Record<string, string> = {
    'Quero comprar agora':                  'que deseja comprar agora',
    'Quero comprar em breve (até 30 dias)': 'que pretende comprar em breve',
    'Estou comparando opções':              'que está comparando opções',
    'Só quero entender melhor o produto':   'que está conhecendo nossos produtos',
  };

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Brave — Recebemos seu contato</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#18181b;border:1px solid #27272a;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:32px 40px 24px;border-bottom:1px solid #27272a;">
              <p style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                BRAVE<span style="color:#4ade80;">HUB</span>
              </p>
              <p style="margin:4px 0 0;font-size:11px;color:#71717a;letter-spacing:2px;text-transform:uppercase;">Equipamentos de Alta Performance</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 8px;font-size:22px;font-weight:700;color:#ffffff;">
                Olá, ${primeiroNome}! 👋
              </p>
              <p style="margin:0 0 24px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                Recebemos seu contato e sabemos ${momentoTexto[momento] || 'que tem interesse'} nos nossos equipamentos.
                Nosso consultor <strong style="color:#ffffff;">${consultor}</strong> já foi notificado e entrará em contato em breve.
              </p>

              <!-- Produtos -->
              <div style="background:#09090b;border:1px solid #27272a;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
                <p style="margin:0 0 12px;font-size:11px;font-weight:700;color:#71717a;letter-spacing:2px;text-transform:uppercase;">Equipamentos de interesse</p>
                <ul style="margin:0;padding-left:20px;">
                  ${listaProdutos}
                </ul>
              </div>

              <!-- CTA WhatsApp -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${whatsappConsultor}"
                       style="display:inline-block;background:#4ade80;color:#09090b;font-weight:800;font-size:14px;text-decoration:none;padding:14px 32px;border-radius:10px;letter-spacing:0.3px;">
                      💬 Falar com o Consultor agora
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #27272a;">
              <p style="margin:0;font-size:12px;color:#52525b;text-align:center;line-height:1.6;">
                Brave Equipamentos · São Paulo, SP<br/>
                Você está recebendo este email porque nos enviou seu contato.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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

    const { nome, telefone, email, momento_compra, produtos_interesse, consultor, observacoes } = await req.json();

    if (!nome || !telefone || !produtos_interesse?.length) {
      return new Response(JSON.stringify({ error: 'nome, telefone e produtos_interesse são obrigatórios' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const telefoneLimpo = telefone.replace(/\D/g, '');
    const telefoneFormatado = telefoneLimpo.length === 10 || telefoneLimpo.length === 11
      ? '55' + telefoneLimpo
      : telefoneLimpo;

    const consultorNome = consultor || 'Léo Berg';

    // 1. Salva o lead
    const { data: leadData, error: leadError } = await supabase.from('leads').insert({
      nome,
      telefone: telefoneFormatado,
      email: email || null,
      momento_compra: momento_compra || 'morno',
      produtos_interesse,
      status: 'novo',
      consultor: consultorNome,
      observacoes: observacoes || null,
      link_rapido_codigo: null,
    }).select().single();

    if (leadError) throw new Error('Erro ao salvar lead: ' + leadError.message);

    // 2. Dispara BotConversa
    const webhookUrl = Deno.env.get('BOTCONVERSA_WEBHOOK_NOVO_LEAD');
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telefone: telefoneFormatado,
          nome,
          produtos: produtos_interesse.join(', '),
          momento: momento_compra,
          consultor: consultorNome,
        }),
      }).catch(err => console.error('Erro ao disparar webhook BotConversa:', err));

      await supabase.from('leads').update({ status: 'fluxo_disparado' }).eq('id', leadData.id);
      leadData.status = 'fluxo_disparado';
    }

    // 3. Envia email via Resend (apenas se o lead tiver email)
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey && email) {
      const html = buildEmailHtml(nome, produtos_interesse, consultorNome, momento_compra);
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Brave Equipamentos <onboarding@resend.dev>',
          to: [email],
          subject: `${nome.split(' ')[0]}, recebemos seu contato! 🏋️`,
          html,
        }),
      }).catch(err => console.error('Erro ao enviar email Resend:', err));
    }

    return new Response(JSON.stringify({ success: true, lead: leadData }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
