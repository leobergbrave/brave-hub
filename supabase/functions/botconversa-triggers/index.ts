import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Variáveis de ambiente necessárias:
// BOTCONVERSA_WEBHOOK_CEP          — CEP calculado
// BOTCONVERSA_WEBHOOK_ABANDONO     — abandono 15 min
// BOTCONVERSA_WEBHOOK_ABANDONO_2H  — abandono 2h (urgência)
// BOTCONVERSA_WEBHOOK_ABANDONO_24H — abandono manhã seguinte (última chamada)
// BOTCONVERSA_WEBHOOK_SEM_CEP      — abriu mas não digitou CEP
// APP_BASE_URL                     — base da URL do app (ex: https://brave-hub-two.vercel.app)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const EQUIPAMENTOS: Record<string, string> = {
  bikeerg: 'Bike Erg', remo: 'Remo Indoor', skierg: 'Ski Erg',
  storm: 'Storm Bike', estcv: 'Esteira Curva', escada: 'Escada',
};

function aliasParaNome(texto: string): string {
  return texto.split(',').map(a => EQUIPAMENTOS[a.trim()] || a.trim()).join(', ');
}

// Retorna o próximo horário de envio respeitando horário comercial Brasília (9h-18h, UTC-3)
// Se o candidato cair fora do horário, empurra para 9h do próximo dia
function nextAlertTime(now: Date, minutesFromNow: number): string {
  const candidate = new Date(now.getTime() + minutesFromNow * 60 * 1000);
  const brasiliaHour = (candidate.getUTCHours() + 21) % 24; // UTC-3
  if (brasiliaHour >= 9 && brasiliaHour < 18) return candidate.toISOString();
  return next9hBrasilia(candidate).toISOString();
}

// Próxima manhã às 9h Brasília, com pelo menos minHours de distância
function next9hBrasilia(from: Date, minHours = 0): Date {
  const candidate = new Date(from.getTime() + minHours * 60 * 60 * 1000);
  const brasiliaHour = (candidate.getUTCHours() + 21) % 24;
  const next = new Date(candidate);
  if (brasiliaHour >= 9) next.setUTCDate(next.getUTCDate() + 1); // já passou das 9h → dia seguinte
  next.setUTCHours(12, 0, 0, 0); // 9h Brasília = 12h UTC
  return next;
}

async function dispararWebhook(url: string, body: Record<string, unknown>): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(err => console.error('Erro webhook BotConversa:', err));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://brave-hub-two.vercel.app';
    const raw = await req.json();
    // BotConversa envolve o payload em { root: { ... } } — normaliza para formato plano
    const body = raw.root ?? raw;
    const { evento, codigo_link, cep_info } = body;

    // ══════════════════════════════════════════════
    // 0. LEAD RESPONDEU — chamado pelo BotConversa
    //    após o lead responder à 1ª mensagem do fluxo
    // ══════════════════════════════════════════════
    if (evento === 'lead_respondeu') {
      const telefoneRaw: string = body.telefone || '';
      if (!telefoneRaw) {
        return new Response(JSON.stringify({ error: 'Telefone obrigatório' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      const telNorm = telefoneRaw.replace(/\D/g, '');

      // Busca leads em fluxo_disparado e normaliza o telefone para comparar
      const { data: leadsRaw } = await supabase
        .from('leads')
        .select('id, telefone, status')
        .eq('status', 'fluxo_disparado')
        .order('criado_em', { ascending: false })
        .limit(50);

const leadMatch = (leadsRaw || []).find(
        (l: any) => l.telefone.replace(/\D/g, '') === telNorm
      );

      if (!leadMatch) {
        return new Response(JSON.stringify({ ok: false, motivo: 'Lead não encontrado ou status incompatível' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      await supabase.from('leads').update({
        status:       'respondeu',
        respondeu_em: new Date().toISOString(),
      }).eq('id', leadMatch.id);

      return new Response(JSON.stringify({ ok: true, lead_id: leadMatch.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ══════════════════════════════════════════════
    // 1. CEP CALCULADO
    // ══════════════════════════════════════════════
    if (evento === 'cep_calculado') {
      const { data: linkData, error: linkError } = await supabase
        .from('links_rapidos')
        .select('telefone_lead, nome_lead, produtos_texto')
        .eq('codigo', codigo_link)
        .single();

      if (linkError || !linkData?.telefone_lead) {
        return new Response(JSON.stringify({ error: 'Link não encontrado ou sem telefone' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      const webhookCep = Deno.env.get('BOTCONVERSA_WEBHOOK_CEP')
        || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/khASXU0abK3M/';

      await dispararWebhook(webhookCep, {
        telefone:   linkData.telefone_lead,
        nome:       linkData.nome_lead,
        produtos:   aliasParaNome(linkData.produtos_texto || ''),
        cep_cidade: cep_info?.localidade,
        cep_estado: cep_info?.uf,
      });

      // Marca aberto, registra aberto_em e encerra sequência de abandono
      await supabase.from('links_rapidos').update({
        aberto:                  true,
        alerta_abandono_enviado: true,
        abandono_stage:          3,
        proximo_alerta_em:       null,
        aberto_em:               new Date().toISOString(),
      }).eq('codigo', codigo_link);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ══════════════════════════════════════════════
    // 2. VERIFICAR ABANDONOS — sequência multi-step
    //    + "abriu mas não digitou CEP"
    // ══════════════════════════════════════════════
    if (evento === 'verificar_abandonos') {
      const now = new Date();
      const processados = { stage1: 0, stage2: 0, stage3: 0, semCep: 0 };

      const wh15min = Deno.env.get('BOTCONVERSA_WEBHOOK_ABANDONO')
        || 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/QRvsDhJ18g5P/';
      const wh2h    = Deno.env.get('BOTCONVERSA_WEBHOOK_ABANDONO_2H');
      const wh24h   = Deno.env.get('BOTCONVERSA_WEBHOOK_ABANDONO_24H');
      const whSemCep = Deno.env.get('BOTCONVERSA_WEBHOOK_SEM_CEP');

      // ── Stage 0 → 1: 15 min após criação ──
      {
        const fifteenMinsAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();
        const { data: leads } = await supabase
          .from('links_rapidos')
          .select('id, telefone_lead, nome_lead, produtos_texto, codigo')
          .eq('aberto', false)
          .eq('abandono_stage', 0)
          .eq('alerta_abandono_enviado', false)
          .not('telefone_lead', 'is', null)
          .lt('criado_em', fifteenMinsAgo);

        for (const lead of leads || []) {
          const { data: rc } = await supabase.from('links_rapidos')
            .select('aberto, abandono_stage').eq('id', lead.id).single();
          if (rc?.aberto || (rc?.abandono_stage ?? 0) > 0) continue;

          const { error } = await supabase.from('links_rapidos').update({
            alerta_abandono_enviado: true,
            abandono_stage:          1,
            proximo_alerta_em:       nextAlertTime(now, 120), // 2h, respeitando horário
          }).eq('id', lead.id);

          if (!error) {
            await dispararWebhook(wh15min, {
              telefone: lead.telefone_lead, nome: lead.nome_lead,
              produtos: aliasParaNome(lead.produtos_texto || ''),
              link: `${BASE_URL}/q/${lead.codigo}`,
            });
            processados.stage1++;
          }
        }
      }

      // ── Stage 1 → 2: 2h depois (urgência) ──
      if (wh2h) {
        const { data: leads } = await supabase
          .from('links_rapidos')
          .select('id, telefone_lead, nome_lead, produtos_texto, codigo')
          .eq('aberto', false)
          .eq('abandono_stage', 1)
          .lte('proximo_alerta_em', now.toISOString())
          .not('telefone_lead', 'is', null);

        for (const lead of leads || []) {
          const { data: rc } = await supabase.from('links_rapidos')
            .select('aberto, abandono_stage').eq('id', lead.id).single();
          if (rc?.aberto || rc?.abandono_stage !== 1) continue;

          const { error } = await supabase.from('links_rapidos').update({
            abandono_stage:    2,
            proximo_alerta_em: next9hBrasilia(now, 12).toISOString(), // manhã seguinte
          }).eq('id', lead.id);

          if (!error) {
            await dispararWebhook(wh2h, {
              telefone: lead.telefone_lead, nome: lead.nome_lead,
              produtos: aliasParaNome(lead.produtos_texto || ''),
              link: `${BASE_URL}/q/${lead.codigo}`,
            });
            processados.stage2++;
          }
        }
      }

      // ── Stage 2 → 3: manhã seguinte (última chamada) ──
      if (wh24h) {
        const { data: leads } = await supabase
          .from('links_rapidos')
          .select('id, telefone_lead, nome_lead, produtos_texto, codigo')
          .eq('aberto', false)
          .eq('abandono_stage', 2)
          .lte('proximo_alerta_em', now.toISOString())
          .not('telefone_lead', 'is', null);

        for (const lead of leads || []) {
          const { data: rc } = await supabase.from('links_rapidos')
            .select('aberto, abandono_stage').eq('id', lead.id).single();
          if (rc?.aberto || rc?.abandono_stage !== 2) continue;

          const { error } = await supabase.from('links_rapidos').update({
            abandono_stage:    3,
            proximo_alerta_em: null,
          }).eq('id', lead.id);

          if (!error) {
            await dispararWebhook(wh24h, {
              telefone: lead.telefone_lead, nome: lead.nome_lead,
              produtos: aliasParaNome(lead.produtos_texto || ''),
              link: `${BASE_URL}/q/${lead.codigo}`,
            });
            processados.stage3++;
          }
        }
      }

      // ── "Abriu mas não digitou CEP" (30 min após abertura) ──
      if (whSemCep) {
        const thirtyMinsAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
        const { data: leads } = await supabase
          .from('links_rapidos')
          .select('id, telefone_lead, nome_lead, produtos_texto, codigo')
          .eq('aberto', true)
          .eq('cep_digitado', false)
          .eq('alerta_sem_cep_enviado', false)
          .not('telefone_lead', 'is', null)
          .not('aberto_em', 'is', null)
          .lt('aberto_em', thirtyMinsAgo);

        for (const lead of leads || []) {
          const { data: rc } = await supabase.from('links_rapidos')
            .select('cep_digitado, alerta_sem_cep_enviado').eq('id', lead.id).single();
          if (rc?.cep_digitado || rc?.alerta_sem_cep_enviado) continue;

          const { error } = await supabase.from('links_rapidos').update({
            alerta_sem_cep_enviado: true,
          }).eq('id', lead.id);

          if (!error) {
            await dispararWebhook(whSemCep, {
              telefone: lead.telefone_lead, nome: lead.nome_lead,
              produtos: aliasParaNome(lead.produtos_texto || ''),
              link: `${BASE_URL}/q/${lead.codigo}`,
            });
            processados.semCep++;
          }
        }
      }

      return new Response(JSON.stringify({ success: true, processados }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Evento inválido' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
