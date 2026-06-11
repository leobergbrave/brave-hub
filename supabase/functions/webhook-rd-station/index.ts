import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeia os nomes dos equipamentos do RD Station para aliases internos do sistema
const EQUIPMENT_MAP: Record<string, string> = {
  'bike erg':      'bikeerg',
  'remo':          'remo',
  'ski':           'skierg',
  'storm bike':    'storm',
  'esteira curva': 'estcv',
  'escada':        'escada',
};

// Extrai o valor de um campo personalizado do RD Station pelo nome (busca parcial)
function extractCustomField(fields: any[], searchTerm: string): string {
  if (!fields || !Array.isArray(fields)) return '';
  const field = fields.find((f: any) => {
    const name = (f.custom_field?.name || f.name || '').toLowerCase();
    return name.includes(searchTerm.toLowerCase());
  });
  return field?.value || '';
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

    const body = await req.json();
    console.log('RD Station payload:', JSON.stringify(body, null, 2));

    // RD Station envia o deal dentro de body.deal ou diretamente
    const deal = body.deal || body;
    const consultorNome = deal.user?.name || deal.user_name || 'Léo Berg';

    // ── 1. Extrair nome ──────────────────────────────────────────
    const nome = deal.name || deal.deal_name || 'Lead RD';

    // ── 2. Extrair telefone do contato ───────────────────────────
    let telefone = '';
    const contatos = deal.contacts || [];
    if (contatos.length > 0) {
      const phones = contatos[0].phones || [];
      telefone = phones[0]?.phone || '';
    }
    let telefoneLimpo = telefone.replace(/\D/g, '');
    if (telefoneLimpo.length === 10 || telefoneLimpo.length === 11) {
      telefoneLimpo = '55' + telefoneLimpo;
    }

    // ── 3. Extrair campos personalizados ─────────────────────────
    const camposPersonalizados = deal.deal_custom_fields || [];

    const equipamentosRaw = extractCustomField(camposPersonalizados, 'equipamento');
    const momentoRaw      = extractCustomField(camposPersonalizados, 'momento');

    // ── 4. Processar equipamentos → aliases internos ──────────────
    const equipamentosLista = equipamentosRaw
      .split(',')
      .map((e: string) => e.trim().toLowerCase())
      .filter(Boolean);

    const aliases = equipamentosLista
      .map((e: string) => EQUIPMENT_MAP[e] || e)
      .filter(Boolean);

    // ── 5. Criar link rápido ──────────────────────────────────────
    const codigo = Math.random().toString(36).substring(2, 8);

    if (aliases.length > 0) {
      await supabase.from('links_rapidos').insert({
        codigo,
        produtos_texto: aliases.join(','),
        nome_lead: nome,
        telefone_lead: telefoneLimpo,
        aberto: false,
        alerta_abandono_enviado: false,
      });
    }

    // ── 6. Salvar lead na tabela leads ────────────────────────────
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .insert({
        nome,
        telefone: telefoneLimpo,
        momento_compra: momentoRaw || 'Não informado',
        produtos_interesse: aliases.length > 0 ? aliases : equipamentosLista,
        status: 'fluxo_disparado',
        consultor: consultorNome,
        observacoes: `Origem: RD Station CRM | Campanha: ${deal.campaign?.name || 'N/A'} | Etapa: ${deal.deal_stage?.name || 'N/A'}`,
        link_rapido_codigo: aliases.length > 0 ? codigo : null,
      })
      .select()
      .single();

    if (leadError) {
      console.error('Erro ao salvar lead:', leadError);
      // Não lança erro para não bloquear o webhook do RD Station
    }

    // ── 7. Disparar BotConversa ───────────────────────────────────
    const webhookUrl = Deno.env.get('BOTCONVERSA_WEBHOOK_NOVO_LEAD');
    let botConversaStatus = 'webhook_nao_configurado';

    if (webhookUrl && telefoneLimpo) {
      const baseUrl = Deno.env.get('APP_BASE_URL') || 'https://brave-hub-two.vercel.app';
      const linkOrcamento = aliases.length > 0 ? `${baseUrl}/q/${codigo}` : '';

      const bcRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome,
          telefone: telefoneLimpo,
          momento_detectado: momentoRaw,
          produtos_interesse: equipamentosRaw,
          link: linkOrcamento,
          consultor: consultorNome,
        }),
      });

      botConversaStatus = bcRes.ok ? 'enviado' : `erro_${bcRes.status}`;
    }

    return new Response(JSON.stringify({
      success: true,
      lead_id: leadData?.id || null,
      botconversa: botConversaStatus,
      codigo_link: codigo,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Erro na edge function webhook-rd-station:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
