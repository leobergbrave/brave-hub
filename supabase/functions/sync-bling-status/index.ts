import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * sync-bling-status
 *
 * Consulta o Bling ERP e atualiza o status de entrega dos pedidos
 * vinculados a orçamentos aprovados.
 *
 * Pode ser chamada:
 *  - Via cron (Supabase Scheduled Function ou pg_cron)
 *  - Manualmente pelo painel Admin
 *  - Com body { orcamento_id } para sincronizar um pedido específico
 *
 * Quando o status do Bling for "atendido" (ou equivalentes), salva
 * data_entrega em orcamentos_salvos, permitindo ao painel Pós-Venda
 * exibir as ações de Avaliação Google e NPS.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Status do Bling que indicam que o pedido foi entregue/finalizado
const STATUS_ENTREGUE = new Set([
  'atendido',
  'entregue',
  'concluido',
  'concluído',
]);

// Status do Bling que indicam que o pedido está em andamento (não entregue ainda)
const STATUS_EM_ANDAMENTO = new Set([
  'em aberto',
  'em andamento',
  'em preparação',
  'em separacao',
  'em separação',
  'em transporte',
  'saiu para entrega',
  'aguardando entrega',
]);

async function getBlingToken(supabase: any) {
  const { data, error } = await supabase
    .from('bling_config')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !data) throw new Error('Credenciais da Bling não encontradas.');
  return data;
}

async function refreshBlingToken(supabase: any, config: any) {
  const credentials = btoa(`${config.client_id}:${config.client_secret}`);
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Falha ao renovar token Bling: ${err}`);
  }

  const tokenData = await response.json();
  await supabase.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);

  return tokenData.access_token;
}

async function fetchBling(url: string, supabase: any): Promise<any> {
  let config = await getBlingToken(supabase);

  let res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.access_token}`,
      Accept: '1.0',
    },
  });

  // Renovar token se expirado (401)
  if (res.status === 401) {
    console.log('[sync-bling-status] Token expirado. Renovando...');
    const newToken = await refreshBlingToken(supabase, config);
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${newToken}`,
        Accept: '1.0',
      },
    });
  }

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Bling API error (${res.status}): ${err}`);
  }

  return res.json();
}

/**
 * Busca o status de um pedido pelo ID no Bling.
 * Retorna { situacao, dataEntrega } ou null se não encontrado.
 */
async function getPedidoStatus(pedidoId: number, supabase: any) {
  const data = await fetchBling(
    `https://api.bling.com.br/v3/pedidos/vendas/${pedidoId}`,
    supabase
  );

  const pedido = data?.data;
  if (!pedido) return null;

  const situacao = (pedido.situacao?.nome || '').toLowerCase().trim();
  
  // Bling pode retornar a data de saída do estoque/entrega em campos variados
  const dataEntregaBling =
    pedido.dataEntrega ||
    pedido.dataSaida ||
    pedido.dataPrevista ||
    null;

  return { situacao, dataEntregaBling, pedidoRaw: pedido };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    // Verificar se foi passado um orçamento específico
    let orcamentoId: string | null = null;
    try {
      const body = await req.json();
      orcamentoId = body?.orcamento_id || null;
    } catch {
      // body vazio — modo cron (sincroniza todos)
    }

    // ── Buscar orçamentos aprovados com bling_pedido_id preenchido
    // que ainda NÃO foram entregues (data_entrega IS NULL)
    // e que ainda não foram cancelados no Bling
    let query = supabase
      .from('orcamentos_salvos')
      .select('id, cliente, bling_pedido_id, bling_status_pedido, data_entrega')
      .eq('payload->>status', 'Aprovado')
      .not('bling_pedido_id', 'is', null)
      .is('data_entrega', null)
      .neq('bling_status_pedido', 'cancelado');

    if (orcamentoId) {
      query = query.eq('id', orcamentoId);
    }

    const { data: orcamentos, error } = await query.limit(50);

    if (error) throw new Error(`Erro ao buscar orçamentos: ${error.message}`);

    const total = orcamentos?.length || 0;
    console.log(`[sync-bling-status] ${total} orçamento(s) para verificar.`);

    if (total === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: 'Nenhum pedido para verificar.', verificados: 0, entregues: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let entregues = 0;
    let atualizados = 0;
    const erros: string[] = [];

    for (const orc of orcamentos!) {
      try {
        const status = await getPedidoStatus(orc.bling_pedido_id, supabase);

        if (!status) {
          console.warn(`[sync-bling-status] Pedido ${orc.bling_pedido_id} não encontrado no Bling.`);
          continue;
        }

        const agora = new Date().toISOString();
        const isEntregue = STATUS_ENTREGUE.has(status.situacao);

        const update: Record<string, any> = {
          bling_status_pedido: status.situacao,
          bling_status_verificado_em: agora,
        };

        if (isEntregue) {
          update.data_entrega = status.dataEntregaBling
            ? new Date(status.dataEntregaBling).toISOString()
            : agora;
          entregues++;
          console.log(`[sync-bling-status] ✅ Entregue: ${orc.cliente} (pedido ${orc.bling_pedido_id})`);
        } else {
          console.log(`[sync-bling-status] ⏳ Em andamento: ${orc.cliente} — "${status.situacao}"`);
        }

        await supabase
          .from('orcamentos_salvos')
          .update(update)
          .eq('id', orc.id);

        // Quando entregue: preencher datas de avaliacao e nps em posv_acoes
        if (isEntregue && update.data_entrega) {
          const dataEntrega = new Date(update.data_entrega);
          const d7 = new Date(dataEntrega);
          d7.setDate(d7.getDate() + 7);
          const agoraTs = new Date().toISOString();

          await supabase.from('posv_acoes')
            .update({ prevista_em: dataEntrega.toISOString(), atualizado_em: agoraTs })
            .eq('orcamento_id', orc.id)
            .eq('estrategia_id', 'avaliacao')
            .is('executado_em', null)
            .is('prevista_em', null);

          await supabase.from('posv_acoes')
            .update({ prevista_em: d7.toISOString(), atualizado_em: agoraTs })
            .eq('orcamento_id', orc.id)
            .eq('estrategia_id', 'nps')
            .is('executado_em', null)
            .is('prevista_em', null);
        }

        atualizados++;

        // Respeitar rate limit do Bling (max 3 req/s)
        await sleep(400);
      } catch (e: any) {
        console.error(`[sync-bling-status] Erro no pedido ${orc.bling_pedido_id}:`, e.message);
        erros.push(`Pedido ${orc.bling_pedido_id}: ${e.message}`);
        await sleep(400);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        verificados: atualizados,
        entregues,
        erros: erros.length > 0 ? erros : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[sync-bling-status] Erro geral:', error.message);
    return new Response(
      JSON.stringify({ ok: false, error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
