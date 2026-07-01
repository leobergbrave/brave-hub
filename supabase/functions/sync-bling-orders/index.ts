import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * sync-bling-orders
 *
 * Suporta 3 modos via body:
 *   { mode: 'preview', dias_atras: 60 }  -- lista pedidos sem importar
 *   { mode: 'import', pedido_ids: [id1, id2] } -- importa pedidos selecionados
 *   { dias_atras: 60 }  -- importa todos (modo legado, sem filtro de status)
 *   { pedido_id: 123456 } -- importa um pedido especifico
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const STATUS_ENTREGUE = new Set([
  'atendido', 'entregue', 'concluido', 'concluido',
]);

// Status que disparam a importacao do pedido para o sistema
const STATUS_PARA_IMPORTAR = new Set([
  'em andamento',
  'em preparacao',
  'em preparação',
  'em separacao',
  'em separação',
  'em transporte',
  'saiu para entrega',
  'aguardando entrega',
  'atendido',
  'entregue',
  'concluido',
  'concluído',
]);

// Vendedores cujos pedidos serao importados
const VENDEDORES_PERMITIDOS = [
  'leo berg',
];

function normalizarNome(nome: string): string {
  return (nome || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
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
    .from('bling_config')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !data) throw new Error('Configuracao do Bling nao encontrada.');
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

/**
 * Busca telefone do contato no Bling pelo ID do contato
 */
async function fetchTelefoneContato(contatoId: number, supabase: any): Promise<string> {
  if (!contatoId) return '';
  try {
    await sleep(350);
    const res = await fetchWithBlingAuth(
      `https://api.bling.com.br/v3/contatos/${contatoId}`,
      { method: 'GET' },
      supabase,
    );
    if (!res.ok) return '';
    const json = await res.json();
    const contato = json.data;
    return contato?.celular || contato?.telefone || contato?.fone || '';
  } catch (_) {
    return '';
  }
}

/**
 * Cascade disparado quando uma venda é aprovada:
 * 1. Upsert em clientes (cria ou atualiza dados financeiros + status_ciclo)
 * 2. Cria agenda de pós-venda em posv_acoes (idempotente por UNIQUE constraint)
 */
async function processarVendaAprovada(
  supabase: any,
  orcamentoId: string,
  nome: string,
  telefone: string,
  valorTotal: number,
  aprovadoEm: string,
) {
  // Idempotência: se já tem cliente_id vinculado, skip
  const { data: orcAtual } = await supabase
    .from('orcamentos_salvos')
    .select('cliente_id')
    .eq('id', orcamentoId)
    .single();

  let clienteId: string | null = orcAtual?.cliente_id || null;

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

    if (clienteId) {
      await supabase.from('orcamentos_salvos')
        .update({ cliente_id: clienteId })
        .eq('id', orcamentoId);
    }
  }

  // Criar agenda posv_acoes (idempotente via UNIQUE constraint)
  const addDays = (baseIso: string, dias: number) => {
    const d = new Date(baseIso);
    d.setDate(d.getDate() + dias);
    return d.toISOString();
  };

  const acoes = [
    { estrategia_id: 'montagem',  prevista_em: aprovadoEm },
    { estrategia_id: 'checkin30', prevista_em: addDays(aprovadoEm, 30) },
    { estrategia_id: 'checkin60', prevista_em: addDays(aprovadoEm, 60) },
    { estrategia_id: 'checkin90', prevista_em: addDays(aprovadoEm, 90) },
    { estrategia_id: 'avaliacao', prevista_em: null },
    { estrategia_id: 'nps',       prevista_em: null },
  ].map(a => ({
    ...a,
    orcamento_id: orcamentoId,
    cliente_telefone: telefone,
    cliente_nome: nome,
  }));

  // upsert com onConflict ignora duplicatas (UNIQUE constraint)
  await supabase.from('posv_acoes')
    .upsert(acoes, { onConflict: 'orcamento_id,estrategia_id', ignoreDuplicates: true });

  console.log(`[processarVendaAprovada] ${nome} processado — cliente: ${clienteId}`);
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
  const statusBling = (pedido.situacao?.nome || '').toLowerCase();
  const clienteNome = pedido.contato?.nome || 'Cliente Bling';
  const consultorNome = extrairNomeVendedor(pedido) || 'Leo Berg';
  const slug = `bling-${pedido.id}-${Date.now()}`;

  // Buscar telefone: primeiro nos campos do pedido, depois no endpoint de contatos
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
 * Busca paginas de pedidos do Bling com paginacao
 */
async function listarPedidosBling(diasAtras: number, supabase: any) {
  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - diasAtras);
  const dataInicioStr = dataInicio.toISOString().split('T')[0];

  const pedidos: any[] = [];
  let pagina = 1;

  while (true) {
    const url = `https://api.bling.com.br/v3/pedidos/vendas?pagina=${pagina}&limite=100&dataInicial=${dataInicioStr}`;
    const res = await fetchWithBlingAuth(url, { method: 'GET' }, supabase);
    if (!res.ok) break;
    const json = await res.json();
    const items: any[] = json.data || [];
    pedidos.push(...items);
    if (items.length < 100) break;
    pagina++;
    await sleep(400);
  }
  return pedidos;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    let body: any = {};
    try { body = await req.json(); } catch (_) {}

    const mode = body.mode || 'legacy';
    const diasAtras = Number(body.dias_atras) || 60;

    // ── MODO: PREVIEW — busca detalhes completos em lotes para status e telefone corretos ──
    if (mode === 'preview') {
      const pedidosLista = await listarPedidosBling(diasAtras, supabase);
      const limite = Math.min(pedidosLista.length, 60); // max 60 pedidos no preview
      const amostra = pedidosLista.slice(0, limite);

      // Buscar IDs ja existentes no sistema
      const { data: existentes } = await supabase
        .from('orcamentos_salvos')
        .select('bling_pedido_id')
        .not('bling_pedido_id', 'is', null);
      const idsExistentes = new Set((existentes || []).map((r: any) => String(r.bling_pedido_id)));

      // Busca detalhes completos em lotes de 3 para respeitar rate limit
      const detalhes: any[] = [];
      const LOTE = 3;
      for (let i = 0; i < amostra.length; i += LOTE) {
        const lote = amostra.slice(i, i + LOTE);
        const resultados = await Promise.all(lote.map(async (p: any) => {
          try {
            const res = await fetchWithBlingAuth(
              `https://api.bling.com.br/v3/pedidos/vendas/${p.id}`,
              { method: 'GET' }, supabase,
            );
            if (!res.ok) return null;
            return (await res.json()).data;
          } catch (_) { return null; }
        }));
        detalhes.push(...resultados.filter(Boolean));
        if (i + LOTE < amostra.length) await sleep(400);
      }

      // Mapear detalhes por ID para merge com itens da listagem
      const detailMap: Record<string, any> = {};
      for (const d of detalhes) {
        if (d?.id) detailMap[String(d.id)] = d;
      }

      // Filtrar apenas pedidos do vendedor permitido (usa detalhe se disponível, senão item da listagem)
      const amostraFiltrada = amostra.filter(p => {
        const detail = detailMap[String(p.id)];
        return vendedorPermitido(detail || p);
      });

      // Coletar IDs únicos de contatos para buscar telefones
      const contatoIdPorPedido: Record<string, number> = {};
      for (const p of amostraFiltrada) {
        const detail = detailMap[String(p.id)];
        const cid = detail?.contato?.id || p.contato?.id;
        if (cid) contatoIdPorPedido[String(p.id)] = Number(cid);
      }
      const uniqueContatoIds = [...new Set(Object.values(contatoIdPorPedido))];

      // Buscar telefones em batch
      const phoneByContatoId: Record<string, string> = {};
      for (let i = 0; i < uniqueContatoIds.length; i += LOTE) {
        const lote = uniqueContatoIds.slice(i, i + LOTE);
        await Promise.all(lote.map(async (cid: number) => {
          try {
            const res = await fetchWithBlingAuth(
              `https://api.bling.com.br/v3/contatos/${cid}`,
              { method: 'GET' }, supabase,
            );
            if (!res.ok) return;
            const c = (await res.json()).data;
            const tel = c?.celular || c?.telefone || c?.fone || '';
            if (tel) phoneByContatoId[String(cid)] = tel;
          } catch (_) {}
        }));
        if (i + LOTE < uniqueContatoIds.length) await sleep(400);
      }

      // Usar amostraFiltrada (só vendedor Leo Berg) como base
      const lista = amostraFiltrada.map((p: any) => {
        const detail = detailMap[String(p.id)];
        const statusNome = detail?.situacao?.nome || p.situacao?.nome || 'Desconhecido';
        const contatoId = contatoIdPorPedido[String(p.id)];
        const telefone = (contatoId && phoneByContatoId[String(contatoId)]) ||
          detail?.contato?.celular || detail?.contato?.telefone || detail?.contato?.fone ||
          p.contato?.celular || p.contato?.telefone || p.contato?.fone || '';
        const clienteNome = detail?.contato?.nome || p.contato?.nome || 'Cliente Bling';
        const vendedor = (detail ? extrairNomeVendedor(detail) : '') || extrairNomeVendedor(p) || 'Nao informado';
        const valor = Number(detail?.totalProdutos) || Number(detail?.total) || Number(p.totalProdutos) || Number(p.total) || 0;

        return {
          id: p.id,
          numero: detail?.numero || p.numero,
          data: detail?.data || p.data,
          cliente: clienteNome,
          vendedor,
          status: statusNome,
          valor,
          telefone,
          jaImportado: idsExistentes.has(String(p.id)),
          elegivel: STATUS_PARA_IMPORTAR.has(statusNome.toLowerCase()),
        };
      });

      return new Response(JSON.stringify({ ok: true, pedidos: lista, total: pedidosLista.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // ── MODO: IMPORT SELECIONADO — importa IDs especificos ────────────────────
    if (mode === 'import') {
      const pedidoIds: number[] = (body.pedido_ids || []).map(Number).filter(Boolean);
      const phoneOverrides: Record<string, string> = body.phone_overrides || {};
      if (!pedidoIds.length) {
        return new Response(JSON.stringify({ ok: false, error: 'Nenhum pedido_id informado.' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
        });
      }

      let importados = 0; let atualizados = 0; let ignorados = 0;
      const erros: string[] = [];

      for (const pedidoId of pedidoIds) {
        await sleep(400);
        try {
          const res = await fetchWithBlingAuth(
            `https://api.bling.com.br/v3/pedidos/vendas/${pedidoId}`,
            { method: 'GET' },
            supabase,
          );
          if (!res.ok) { ignorados++; continue; }
          const fullPedido = (await res.json()).data;

          const { data: existente } = await supabase
            .from('orcamentos_salvos')
            .select('id')
            .eq('bling_pedido_id', String(pedidoId))
            .maybeSingle();

          if (existente) {
            await supabase.from('orcamentos_salvos').update({
              bling_status_pedido: (fullPedido.situacao?.nome || '').toLowerCase(),
              bling_status_verificado_em: new Date().toISOString(),
            }).eq('id', existente.id);
            atualizados++;
          } else {
            const orc = await pedidoParaOrcamento(fullPedido, supabase);
            const telOverride = phoneOverrides[String(pedidoId)];
            if (telOverride) orc.payload.telefoneCliente = telOverride;
            const { data: criado, error: errCria } = await supabase
              .from('orcamentos_salvos').insert(orc).select('id').single();
            if (errCria) { erros.push(`${pedidoId}: ${errCria.message}`); ignorados++; }
            else {
              importados++;
              // Cascade: upsert cliente + criar posv_acoes
              try {
                const itens = orc.payload.itens || [];
                const valorTotal = itens.reduce((s: number, i: any) => s + i.preco * i.quantidade, 0)
                  + (orc.payload.frete || 0);
                await processarVendaAprovada(
                  supabase, criado.id, orc.cliente,
                  orc.payload.telefoneCliente || '', valorTotal, orc.aprovado_em,
                );
              } catch (e: any) {
                console.error(`[import] cascade erro ${pedidoId}:`, e.message);
              }
            }
          }
        } catch (e: any) {
          erros.push(`${pedidoId}: ${e.message}`);
          ignorados++;
        }
      }

      return new Response(JSON.stringify({ ok: true, importados, atualizados, ignorados, erros }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
      });
    }

    // ── MODO LEGADO: pedido especifico por numero/id ──────────────────────────
    const pedidoIdEspecifico = body.pedido_id ? Number(body.pedido_id) : null;
    if (pedidoIdEspecifico) {
      const res = await fetchWithBlingAuth(
        `https://api.bling.com.br/v3/pedidos/vendas/${pedidoIdEspecifico}`,
        { method: 'GET' }, supabase,
      );
      if (!res.ok) throw new Error(`Pedido ${pedidoIdEspecifico} nao encontrado.`);
      const pedido = (await res.json()).data;

      const { data: existente } = await supabase
        .from('orcamentos_salvos').select('id').eq('bling_pedido_id', String(pedidoIdEspecifico)).maybeSingle();

      if (existente) {
        await supabase.from('orcamentos_salvos').update({
          bling_status_pedido: (pedido.situacao?.nome || '').toLowerCase(),
          bling_status_verificado_em: new Date().toISOString(),
        }).eq('id', existente.id);
        return new Response(JSON.stringify({ ok: true, importados: 0, atualizados: 1, ignorados: 0, erros: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
        });
      }

      const orc = await pedidoParaOrcamento(pedido, supabase);
      const { error: errCria } = await supabase.from('orcamentos_salvos').insert(orc);
      return new Response(JSON.stringify({
        ok: !errCria, importados: errCria ? 0 : 1, atualizados: 0, ignorados: errCria ? 1 : 0, erros: errCria ? [errCria.message] : [],
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // ── MODO LEGADO: importar por periodo ─────────────────────────────────────
    const pedidos = await listarPedidosBling(diasAtras, supabase);
    const { data: idsExistentes } = await supabase
      .from('orcamentos_salvos').select('bling_pedido_id').not('bling_pedido_id', 'is', null);
    const idsSet = new Set((idsExistentes || []).map((r: any) => String(r.bling_pedido_id)));

    let importados = 0; let atualizados = 0; let ignorados = 0;
    const erros: string[] = [];

    for (const pedido of pedidos) {
      const pedidoId = String(pedido.id);
      if (idsSet.has(pedidoId)) {
        await supabase.from('orcamentos_salvos').update({
          bling_status_pedido: (pedido.situacao?.nome || '').toLowerCase(),
          bling_status_verificado_em: new Date().toISOString(),
        }).eq('bling_pedido_id', pedidoId);
        atualizados++;
      } else {
        await sleep(350);
        try {
          const resFull = await fetchWithBlingAuth(`https://api.bling.com.br/v3/pedidos/vendas/${pedido.id}`, { method: 'GET' }, supabase);
          if (!resFull.ok) { ignorados++; continue; }
          const fullPedido = (await resFull.json()).data;

          if (!vendedorPermitido(fullPedido)) { ignorados++; continue; }
          const statusPedido = (fullPedido.situacao?.nome || '').toLowerCase();
          if (!STATUS_PARA_IMPORTAR.has(statusPedido)) { ignorados++; continue; }

          const orc = await pedidoParaOrcamento(fullPedido, supabase);
          const { data: criado, error: errCria } = await supabase
            .from('orcamentos_salvos').insert(orc).select('id').single();
          if (errCria) { erros.push(`${pedidoId}: ${errCria.message}`); ignorados++; }
          else {
            importados++;
            idsSet.add(pedidoId);
            try {
              const itens = orc.payload.itens || [];
              const valorTotal = itens.reduce((s: number, i: any) => s + i.preco * i.quantidade, 0)
                + (orc.payload.frete || 0);
              await processarVendaAprovada(
                supabase, criado.id, orc.cliente,
                orc.payload.telefoneCliente || '', valorTotal, orc.aprovado_em,
              );
            } catch (e: any) {
              console.error(`[legacy] cascade erro ${pedidoId}:`, e.message);
            }
          }
        } catch (e: any) {
          erros.push(`${pedidoId}: ${e.message}`); ignorados++;
        }
      }
      await sleep(350);
    }

    return new Response(JSON.stringify({ ok: true, importados, atualizados, ignorados, erros: erros.slice(0, 10), periodo_dias: diasAtras }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error: any) {
    console.error('Erro no sync-bling-orders:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
