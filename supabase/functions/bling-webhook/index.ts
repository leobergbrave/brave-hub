import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * bling-webhook
 *
 * Recebe eventos do Bling ERP via webhook.
 * Quando um Pedido de Venda é criado ou atualizado no Bling,
 * cria ou atualiza o orçamento correspondente no Brave HUB.
 *
 * Ao criar um novo orçamento aprovado, dispara o cascade:
 *   → upsert em clientes (status_ciclo = 'cliente_ativo')
 *   → criação da agenda de pós-venda em posv_acoes
 *
 * Configuração no Bling:
 *   Configurações → Integrações → Webhooks → Adicionar
 *   URL: https://jisbvqrnnujqgbsfondy.supabase.co/functions/v1/bling-webhook
 *   Eventos: "Pedido de Venda - Incluido", "Pedido de Venda - Alterado"
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STATUS_ENTREGUE = new Set([
  'atendido', 'entregue', 'concluido', 'concluído',
]);

const STATUS_PARA_IMPORTAR = new Set([
  'em andamento',
  'em preparacao', 'em preparação',
  'em separacao', 'em separação',
  'em transporte',
  'saiu para entrega',
  'aguardando entrega',
  'atendido', 'entregue', 'concluido', 'concluído',
]);

const VENDEDORES_PERMITIDOS = ['leo berg'];

function normalizarNome(nome: string): string {
  return (nome || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

function extrairNomeVendedor(pedido: any): string {
  return pedido.vendedor?.contato?.nome
    || pedido.vendedor?.nome
    || pedido.vendedor?.contato?.nomeFantasia
    || '';
}

function vendedorPermitido(pedido: any): boolean {
  const nomeVendedor = extrairNomeVendedor(pedido);
  if (!nomeVendedor) return true;
  const normalizado = normalizarNome(nomeVendedor);
  return VENDEDORES_PERMITIDOS.some(v => normalizado.includes(normalizarNome(v)));
}

async function getBlingConfig(supabase: any) {
  const { data, error } = await supabase
    .from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('Configuração do Bling não encontrada.');
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
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refresh_token }),
  });
  if (!response.ok) throw new Error('Falha ao renovar token Bling.');
  const tokenData = await response.json();
  await supabase.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return tokenData.access_token;
}

async function fetchWithBlingAuth(url: string, options: any, supabase: any) {
  const config = await getBlingConfig(supabase);
  let res = await fetch(url, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${config.access_token}`, Accept: '1.0' },
  });
  if (res.status === 401) {
    const newToken = await refreshBlingToken(supabase, config);
    res = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${newToken}`, Accept: '1.0' },
    });
  }
  return res;
}

async function fetchPedidoBling(pedidoId: number, supabase: any) {
  const res = await fetchWithBlingAuth(
    `https://api.bling.com.br/v3/pedidos/vendas/${pedidoId}`,
    { method: 'GET' }, supabase,
  );
  if (!res.ok) throw new Error(`Erro ao buscar pedido ${pedidoId}: ${await res.text()}`);
  return (await res.json()).data;
}

async function fetchTelefoneContato(contatoId: number, supabase: any): Promise<string> {
  if (!contatoId) return '';
  try {
    await sleep(300);
    const res = await fetchWithBlingAuth(
      `https://api.bling.com.br/v3/contatos/${contatoId}`,
      { method: 'GET' }, supabase,
    );
    if (!res.ok) return '';
    const c = (await res.json()).data;
    return c?.celular || c?.telefone || c?.fone || '';
  } catch (_) { return ''; }
}

async function pedidoParaOrcamento(pedido: any, supabase: any) {
  const itens = (pedido.itens || []).map((item: any) => ({
    nome: item.descricao || item.produto?.descricao || 'Produto Bling',
    quantidade: Number(item.quantidade) || 1,
    preco: Number(item.valor) || 0,
    peso_kg: Number(item.produto?.pesoBruto) || 0,
    id: null,
    codigo_sku: item.codigo || '',
  }));

  const frete = Number(pedido.transporte?.frete) || 0;
  const statusBling = (pedido.situacao?.nome || pedido.situacaoStr || '').toLowerCase();
  const clienteNome = pedido.contato?.nome || 'Cliente Bling';
  const consultorNome = extrairNomeVendedor(pedido) || 'Leo Berg';
  const slug = `bling-${pedido.id}-${Date.now()}`;

  let telefone = pedido.contato?.celular || pedido.contato?.telefone || pedido.contato?.fone || '';
  if (!telefone && pedido.contato?.id) {
    telefone = await fetchTelefoneContato(pedido.contato.id, supabase);
  }

  return {
    slug,
    cliente: clienteNome,
    consultor: consultorNome,
    bling_pedido_id: String(pedido.id),
    bling_status_pedido: statusBling,
    bling_status_verificado_em: new Date().toISOString(),
    bling_origem: true,
    aprovado_em: pedido.data ? new Date(pedido.data).toISOString() : new Date().toISOString(),
    data_entrega: STATUS_ENTREGUE.has(statusBling) ? new Date().toISOString() : null,
    payload: {
      status: 'Aprovado',
      itens,
      frete,
      telefoneCliente: telefone,
      observacoes: pedido.observacoes || '',
      numeroPedidoBling: pedido.numero,
    },
  };
}

/**
 * Cascade disparado quando uma venda é aprovada:
 * 1. Upsert em clientes (cria ou atualiza dados financeiros)
 * 2. Cria agenda de pós-venda em posv_acoes (idempotente)
 */
async function processarVendaAprovada(
  supabase: any,
  orcamentoId: string,
  nome: string,
  telefone: string,
  valorTotal: number,
  aprovadoEm: string,
) {
  // ── Idempotência: se já tem cliente_id vinculado, skip ────────────────────
  const { data: orcAtual } = await supabase
    .from('orcamentos_salvos')
    .select('cliente_id')
    .eq('id', orcamentoId)
    .single();

  let clienteId: string | null = orcAtual?.cliente_id || null;

  // ── 1. Upsert clientes ────────────────────────────────────────────────────
  if (!clienteId) {
    const telDigits = (telefone || '').replace(/\D/g, '');
    const telSuffix = telDigits.slice(-9);

    let existente: any = null;
    if (telSuffix.length >= 8) {
      const { data } = await supabase
        .from('clientes')
        .select('id, total_compras, total_gasto, data_primeira_compra')
        .ilike('telefone', `%${telSuffix}`)
        .limit(1);
      existente = data?.[0] || null;
    }

    if (existente) {
      await supabase.from('clientes').update({
        total_compras: (existente.total_compras || 0) + 1,
        total_gasto: Number(existente.total_gasto || 0) + valorTotal,
        data_ultima_compra: aprovadoEm,
        status_ciclo: 'cliente_ativo',
        atualizado_em: new Date().toISOString(),
      }).eq('id', existente.id);
      clienteId = existente.id;
    } else {
      const { data: novo } = await supabase.from('clientes').insert({
        nome,
        telefone,
        origem: 'orcamento_aprovado',
        total_compras: 1,
        total_gasto: valorTotal,
        data_primeira_compra: aprovadoEm,
        data_ultima_compra: aprovadoEm,
        status_ciclo: 'cliente_ativo',
      }).select('id').single();
      clienteId = novo?.id || null;
    }

    // Vincular orcamento ao cliente
    if (clienteId) {
      await supabase.from('orcamentos_salvos')
        .update({ cliente_id: clienteId })
        .eq('id', orcamentoId);
    }

    console.log(`[processarVendaAprovada] cliente: ${clienteId} (${nome})`);
  }

  // ── 2. Criar agenda posv_acoes ────────────────────────────────────────────
  const { data: existingAcoes } = await supabase
    .from('posv_acoes')
    .select('estrategia_id')
    .eq('orcamento_id', orcamentoId);

  const existentes = new Set((existingAcoes || []).map((a: any) => a.estrategia_id));

  const addDays = (baseIso: string, dias: number) => {
    const d = new Date(baseIso);
    d.setDate(d.getDate() + dias);
    return d.toISOString();
  };

  const novasAcoes: any[] = [];

  // montagem: imediato (D+0 da aprovação)
  if (!existentes.has('montagem')) {
    novasAcoes.push({
      orcamento_id: orcamentoId,
      cliente_telefone: telefone,
      cliente_nome: nome,
      estrategia_id: 'montagem',
      prevista_em: aprovadoEm,
    });
  }

  // checkin30/60/90: baseados na data de aprovação
  if (!existentes.has('checkin30')) {
    novasAcoes.push({
      orcamento_id: orcamentoId,
      cliente_telefone: telefone,
      cliente_nome: nome,
      estrategia_id: 'checkin30',
      prevista_em: addDays(aprovadoEm, 30),
    });
  }
  if (!existentes.has('checkin60')) {
    novasAcoes.push({
      orcamento_id: orcamentoId,
      cliente_telefone: telefone,
      cliente_nome: nome,
      estrategia_id: 'checkin60',
      prevista_em: addDays(aprovadoEm, 60),
    });
  }
  if (!existentes.has('checkin90')) {
    novasAcoes.push({
      orcamento_id: orcamentoId,
      cliente_telefone: telefone,
      cliente_nome: nome,
      estrategia_id: 'checkin90',
      prevista_em: addDays(aprovadoEm, 90),
    });
  }

  // avaliacao e nps: aguardam confirmação de entrega (prevista_em = null)
  if (!existentes.has('avaliacao')) {
    novasAcoes.push({
      orcamento_id: orcamentoId,
      cliente_telefone: telefone,
      cliente_nome: nome,
      estrategia_id: 'avaliacao',
      prevista_em: null,
    });
  }
  if (!existentes.has('nps')) {
    novasAcoes.push({
      orcamento_id: orcamentoId,
      cliente_telefone: telefone,
      cliente_nome: nome,
      estrategia_id: 'nps',
      prevista_em: null,
    });
  }

  if (novasAcoes.length > 0) {
    await supabase.from('posv_acoes').insert(novasAcoes);
    console.log(`[processarVendaAprovada] ${novasAcoes.length} ações criadas para ${nome}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 1. Validar token do webhook
    let blingConfig: any = null;
    try { blingConfig = await getBlingConfig(supabase); } catch (_) {}

    const webhookToken = blingConfig?.webhook_token;
    if (webhookToken) {
      const urlToken = new URL(req.url).searchParams.get('token');
      const headerToken = req.headers.get('X-Bling-Token') || req.headers.get('Authorization')?.replace('Bearer ', '');
      if (urlToken !== webhookToken && headerToken !== webhookToken) {
        return new Response(JSON.stringify({ error: 'Token inválido' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 2. Parsear body
    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    console.log('Bling webhook recebido:', JSON.stringify(body).slice(0, 500));

    let pedidoId: number | null = null;
    if (body?.data?.id) {
      pedidoId = Number(body.data.id);
    } else if (body?.retorno?.pedidos?.[0]?.pedido?.id) {
      pedidoId = Number(body.retorno.pedidos[0].pedido.id);
    } else if (body?.id) {
      pedidoId = Number(body.id);
    }

    if (!pedidoId) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_pedido_id' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // 3. Buscar pedido no Bling
    await sleep(300);
    const pedido = await fetchPedidoBling(pedidoId, supabase);

    if (!pedido) {
      return new Response(JSON.stringify({ ok: false, error: 'Pedido não encontrado no Bling' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // 4. Verificar se já existe
    const { data: existente } = await supabase
      .from('orcamentos_salvos')
      .select('id, bling_status_pedido')
      .eq('bling_pedido_id', String(pedidoId))
      .maybeSingle();

    const statusBling = (pedido.situacao?.nome || '').toLowerCase();
    const isEntregue = STATUS_ENTREGUE.has(statusBling);

    if (existente) {
      const update: any = {
        bling_status_pedido: statusBling,
        bling_status_verificado_em: new Date().toISOString(),
      };
      if (isEntregue) update.data_entrega = new Date().toISOString();

      await supabase.from('orcamentos_salvos').update(update).eq('id', existente.id);

      // Se entregue: atualizar datas de avaliacao e nps em posv_acoes
      if (isEntregue) {
        const dataEntrega = new Date().toISOString();
        const d7 = new Date(); d7.setDate(d7.getDate() + 7);

        await supabase.from('posv_acoes')
          .update({ prevista_em: dataEntrega, atualizado_em: new Date().toISOString() })
          .eq('orcamento_id', existente.id)
          .eq('estrategia_id', 'avaliacao')
          .is('executado_em', null)
          .is('prevista_em', null);

        await supabase.from('posv_acoes')
          .update({ prevista_em: d7.toISOString(), atualizado_em: new Date().toISOString() })
          .eq('orcamento_id', existente.id)
          .eq('estrategia_id', 'nps')
          .is('executado_em', null)
          .is('prevista_em', null);
      }

      return new Response(JSON.stringify({ ok: true, action: 'updated', orcamento_id: existente.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // 5. Criar novo orçamento (somente se vendedor permitido E status adequado)
    if (!vendedorPermitido(pedido)) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'vendedor_nao_permitido' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    if (!STATUS_PARA_IMPORTAR.has(statusBling)) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'status_nao_elegivel', status: statusBling }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    const novoOrcamento = await pedidoParaOrcamento(pedido, supabase);
    const { data: criado, error: errCria } = await supabase
      .from('orcamentos_salvos')
      .insert(novoOrcamento)
      .select('id')
      .single();

    if (errCria) throw new Error(`Erro ao criar orçamento: ${errCria.message}`);

    // 6. Cascade: upsert cliente + criar posv_acoes
    const telefone = novoOrcamento.payload.telefoneCliente || '';
    const nome = novoOrcamento.cliente;
    const itens = novoOrcamento.payload.itens || [];
    const valorProdutos = itens.reduce((s: number, i: any) => s + i.preco * i.quantidade, 0);
    const valorTotal = valorProdutos + (novoOrcamento.payload.frete || 0);

    try {
      await processarVendaAprovada(
        supabase,
        criado.id,
        nome,
        telefone,
        valorTotal,
        novoOrcamento.aprovado_em,
      );
    } catch (e: any) {
      console.error('[bling-webhook] Erro no cascade (não crítico):', e.message);
    }

    return new Response(JSON.stringify({ ok: true, action: 'created', orcamento_id: criado.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error: any) {
    console.error('Erro no bling-webhook:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
