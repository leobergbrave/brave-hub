import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOGO_URL = 'https://jisbvqrnnujqgbsfondy.supabase.co/storage/v1/object/public/produtos_media/branding/logo-brave.png';
const WHATSAPP_CONSULTOR = 'https://wa.me/5531973446109';
const TRACKER_BASE = 'https://jisbvqrnnujqgbsfondy.supabase.co/functions/v1/email-open-tracker';

const EQUIPAMENTOS: Record<string, string> = {
  bikeerg: 'Bike Erg',
  remo:    'Remo Indoor',
  skierg:  'Ski Erg',
  storm:   'Storm Bike',
  estcv:   'Esteira Curva',
  escada:  'Escada',
};

const KEYWORDS: Record<string, string[]> = {
  bikeerg: ['bike erg'],
  remo:    ['remo indoor', 'remo'],
  skierg:  ['ski erg', 'skierg'],
  storm:   ['storm bike', 'storm'],
  estcv:   ['esteira curva', 'esteira'],
  escada:  ['escada'],
};

function aliasParaNome(aliases: string[]): string {
  return aliases.map(a => EQUIPAMENTOS[a.trim()] || a.trim()).join(', ');
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
}

async function buscarProdutosEmail(aliases: string[], supabase: any): Promise<any[]> {
  const { data: produtos } = await supabase
    .from('produtos')
    .select('id, nome, preco, preco_avista, preco_prazo');
  if (!produtos) return [];

  return aliases.map(alias => {
    const kws = KEYWORDS[alias.toLowerCase().trim()] || [alias];
    const found = produtos.find((p: any) =>
      kws.some((kw: string) => p.nome.toLowerCase().includes(kw))
    );
    return found || { nome: EQUIPAMENTOS[alias] || alias, preco_avista: null, preco_prazo: null };
  });
}

function buildProdutoCards(produtos: any[]): string {
  return produtos.map(p => `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;background:#09090b;border:1px solid #27272a;border-radius:10px;">
      <tr>
        <td style="padding:14px 18px;">
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#ffffff;">${p.nome}</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              ${p.preco_avista ? `
              <td>
                <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">À vista</p>
                <p style="margin:3px 0 0;font-size:18px;font-weight:800;color:#4ade80;">${fmtBRL(p.preco_avista)}</p>
              </td>
              <td style="text-align:right;">
                <p style="margin:0;font-size:10px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">12x cartão</p>
                <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#a1a1aa;">${fmtBRL(p.preco_prazo / 12)}/mês</p>
              </td>
              ` : `
              <td>
                <p style="margin:0;font-size:12px;color:#71717a;">Solicite uma proposta personalizada</p>
              </td>
              `}
            </tr>
          </table>
        </td>
      </tr>
    </table>
  `).join('');
}

function buildEmailHtml(
  nome: string,
  produtos: any[],
  config: any,
  emailId: string | null,
  vars: Record<string, string>
): string {
  const primeiroNome = nome.split(' ')[0];
  const saudacao = renderTemplate(config.texto_saudacao, { nome: primeiroNome, ...vars });
  const corpo = renderTemplate(config.texto_corpo, vars);
  const pixelUrl = emailId ? `${TRACKER_BASE}?id=${emailId}` : '';
  const produtosHtml = buildProdutoCards(produtos);

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${config.assunto_template}</title>
</head>
<body style="margin:0;padding:0;background:#09090b;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#09090b;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:560px;background:#18181b;border:1px solid #27272a;border-radius:16px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#18181b;padding:28px 40px;border-bottom:1px solid #27272a;">
              <img src="${LOGO_URL}" alt="Brave" height="36" style="display:block;height:36px;width:auto;" />
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px 40px;">
              <p style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">
                Olá, ${primeiroNome}! 👋
              </p>
              <p style="margin:0 0 28px;font-size:15px;color:#a1a1aa;line-height:1.6;">
                ${saudacao}<br/><br/>${corpo}
              </p>

              <!-- Produtos -->
              <p style="margin:0 0 14px;font-size:11px;font-weight:700;color:#71717a;letter-spacing:2px;text-transform:uppercase;">Equipamentos de interesse</p>
              ${produtosHtml}

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <a href="${WHATSAPP_CONSULTOR}"
                       style="display:inline-block;background:#4ade80;color:#09090b;font-weight:800;font-size:15px;text-decoration:none;padding:16px 36px;border-radius:10px;letter-spacing:0.3px;">
                      ${config.texto_botao}
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
                ${config.texto_rodape}<br/>
                Você está recebendo este email porque nos enviou seu contato.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
  ${pixelUrl ? `<img src="${pixelUrl}" width="1" height="1" style="display:none;" alt="" />` : ''}
</body>
</html>`;
}

const DEFAULT_CONFIG = {
  from_name: 'Brave Equipamentos',
  from_email: 'contato@alwaysprofit.com.br',
  assunto_template: '{{nome}}, recebemos seu contato! 🏋️',
  texto_saudacao: 'Recebemos seu contato! Já preparamos as informações dos equipamentos que você tem interesse.',
  texto_corpo: 'Nosso consultor {{consultor}} já foi notificado e entrará em contato em breve com uma proposta personalizada.',
  texto_botao: '💬 Falar com o Consultor agora',
  texto_rodape: 'Brave Equipamentos · São Paulo, SP',
};

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
      ? '55' + telefoneLimpo : telefoneLimpo;

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
          produtos: aliasParaNome(produtos_interesse),
          momento: momento_compra,
          consultor: consultorNome,
        }),
      }).catch(err => console.error('Erro BotConversa:', err));

      await supabase.from('leads').update({ status: 'fluxo_disparado' }).eq('id', leadData.id);
      leadData.status = 'fluxo_disparado';
    }

    // 3. Email via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey && email) {
      // Busca config e produtos em paralelo
      const [configRes, produtosEmail] = await Promise.all([
        supabase.from('configuracoes_email').select('*').eq('id', 1).single(),
        buscarProdutosEmail(produtos_interesse, supabase),
      ]);

      const config = configRes.data || DEFAULT_CONFIG;
      const vars = { nome: nome.split(' ')[0], consultor: consultorNome };
      const assunto = renderTemplate(config.assunto_template, vars);

      // Registra o email antes de enviar (para ter o ID do pixel)
      const { data: emailRecord } = await supabase.from('emails_enviados').insert({
        lead_id: leadData.id,
        destinatario: email,
        assunto,
        status: 'enviado',
      }).select().single();

      const html = buildEmailHtml(nome, produtosEmail, config, emailRecord?.id || null, vars);

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${config.from_name} <${config.from_email}>`,
          to: [email],
          subject: assunto,
          html,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error('Resend error:', errText);
        if (emailRecord) {
          await supabase.from('emails_enviados').update({ status: 'falhou' }).eq('id', emailRecord.id);
        }
      }
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
