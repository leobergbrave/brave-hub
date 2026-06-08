import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/enviar-bling-pedido
 * Cria (ou atualiza) contato no Bling e cria pedido de venda com os itens do orçamento.
 * Body: { clienteId, orcamentoSlug }
 */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getBlingConfig() {
  const { data, error } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) return null;
  return data;
}

async function refreshBlingToken(config) {
  const credentials = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refresh_token }),
  });
  if (!response.ok) return null;
  const tokenData = await response.json();
  await supabaseAdmin.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return tokenData.access_token;
}

async function getValidToken() {
  const config = await getBlingConfig();
  if (!config) return null;
  const testRes = await fetch('https://api.bling.com.br/v3/contatos?limite=1', {
    headers: { Authorization: `Bearer ${config.access_token}`, Accept: '1.0' },
  });
  if (testRes.status === 401) return await refreshBlingToken(config);
  return config.access_token;
}

async function blingRequest(url, method, body, token) {
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: '1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { clienteId, orcamentoSlug } = req.body || {};
  if (!clienteId || !orcamentoSlug) {
    return res.status(400).json({ ok: false, error: 'clienteId e orcamentoSlug são obrigatórios.' });
  }

  // 1. Carregar cliente
  const { data: cliente, error: errCliente } = await supabaseAdmin
    .from('clientes').select('*').eq('id', clienteId).single();
  if (errCliente || !cliente) {
    return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });
  }

  // 2. Carregar orçamento
  const { data: orc, error: errOrc } = await supabaseAdmin
    .from('orcamentos_salvos').select('*').eq('slug', orcamentoSlug).single();
  if (errOrc || !orc) {
    return res.status(404).json({ ok: false, error: 'Orçamento não encontrado.' });
  }

  // 3. Token Bling válido
  const token = await getValidToken();
  if (!token) {
    return res.status(500).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });
  }

  const cpfLimpo = (cliente.cpf_cnpj || '').replace(/\D/g, '');
  const df = cliente.dados_fiscais || {};
  const isPJ = cliente.tipo_pessoa === 'J';

  // 4. Buscar contato existente no Bling por CPF/CNPJ
  let contatoId = null;
  if (cpfLimpo) {
    await sleep(300);
    const searchRes = await blingRequest(
      `https://api.bling.com.br/v3/contatos?cpf_cnpj=${cpfLimpo}`, 'GET', null, token
    );
    if (searchRes?.ok) {
      const j = await searchRes.json();
      contatoId = (j.data || [])[0]?.id || null;
    }
  }

  // 5. Criar ou atualizar contato no Bling
  const contatoPayload = {
    nome: cliente.nome,
    tipoPessoa: isPJ ? 'J' : 'F',
    situacao: 'A',
    email: cliente.email || '',
    telefone: cliente.telefone || '',
    celular: cliente.telefone || '',
    cpfCnpj: cpfLimpo,
    ...(isPJ
      ? { fantasia: df.nomeFantasia || '', ie: df.inscricaoEstadual || '' }
      : { dataNascimento: df.dataNascimento || '' }),
    endereco: {
      endereco: df.logradouro || '',
      numero: df.numero || '',
      complemento: df.complemento || '',
      bairro: df.bairro || '',
      municipio: df.cidade || '',
      uf: df.estado || '',
      cep: (df.cep || '').replace(/\D/g, ''),
      pais: 'Brasil',
    },
  };

  await sleep(300);
  if (contatoId) {
    await blingRequest(`https://api.bling.com.br/v3/contatos/${contatoId}`, 'PUT', contatoPayload, token);
  } else {
    const createRes = await blingRequest('https://api.bling.com.br/v3/contatos', 'POST', contatoPayload, token);
    if (createRes?.ok) {
      const j = await createRes.json();
      contatoId = j.data?.id || null;
    } else {
      const errTxt = await createRes?.text?.() || '';
      console.error('[Bling contato] Erro ao criar:', errTxt);
      return res.status(200).json({ ok: false, error: `Erro ao criar contato no Bling: ${errTxt}` });
    }
  }

  if (!contatoId) {
    return res.status(200).json({
      ok: false,
      error: 'Não foi possível criar/encontrar o contato no Bling. Verifique CPF/CNPJ do cliente.',
    });
  }

  // 6. Buscar bling_id dos produtos nos itens do orçamento
  const itensRaw = orc.payload?.itens || [];
  const prodIds = [...new Set(itensRaw.map(i => i.id).filter(Boolean))];
  let prodMap = {};
  if (prodIds.length > 0) {
    const { data: produtos } = await supabaseAdmin
      .from('produtos')
      .select('id, nome, bling_id, codigo_sku')
      .in('id', prodIds);
    (produtos || []).forEach(p => { prodMap[p.id] = p; });
  }

  // 7. Montar itens do pedido
  const itensSemBling = [];
  const itens = itensRaw
    .filter(i => (i.q ?? i.quantidade ?? 0) > 0)
    .map(i => {
      const prod = prodMap[i.id];
      const quantidade = Number(i.q ?? i.quantidade ?? 1);
      const valor = parseFloat(i.p ?? i.preco ?? 0);
      const descricao = prod?.nome || i.nome || 'Produto';
      const item = { descricao, unidade: 'UN', quantidade, valor };
      if (prod?.bling_id) {
        item.produto = { id: Number(prod.bling_id) };
      } else {
        itensSemBling.push(descricao);
      }
      return item;
    });

  if (itens.length === 0) {
    return res.status(200).json({ ok: false, error: 'Orçamento sem itens com quantidade > 0.' });
  }

  // 8. Calcular total
  const totalItens = itens.reduce((acc, i) => acc + i.valor * i.quantidade, 0);
  const frete = parseFloat(orc.payload?.frete || 0);
  const totalPedido = Math.round((totalItens + frete) * 100) / 100;

  // 9. Criar pedido de venda no Bling
  const hoje = new Date().toISOString().split('T')[0];
  const pedidoPayload = {
    contato: { id: Number(contatoId) },
    data: hoje,
    itens,
    observacoes: `Gerado via Brave Hub · Orçamento: ${orcamentoSlug}`,
    transporte: {
      fretePorConta: 'D',
      ...(frete > 0 ? { frete } : {}),
    },
    parcelas: [{ dataVencimento: hoje, valor: totalPedido }],
  };

  await sleep(300);
  const pedidoRes = await blingRequest(
    'https://api.bling.com.br/v3/pedidos/vendas', 'POST', pedidoPayload, token
  );

  const pedidoStatus = pedidoRes?.status;
  const pedidoBodyRaw = await pedidoRes?.text?.() || '';
  console.log('[Bling pedido]', { status: pedidoStatus, body: pedidoBodyRaw.slice(0, 500) });

  if (!pedidoRes?.ok) {
    return res.status(200).json({
      ok: false,
      error: `Erro ao criar pedido no Bling (HTTP ${pedidoStatus}): ${pedidoBodyRaw}`,
    });
  }

  let pedidoId = null;
  let pedidoNumero = null;
  try {
    const pedidoJson = JSON.parse(pedidoBodyRaw);
    pedidoId = pedidoJson.data?.id || null;
    pedidoNumero = pedidoJson.data?.numero || pedidoJson.data?.numeroPedido || null;
  } catch (_) {}

  // 10. Salvar bling_pedido_id no orçamento
  if (pedidoId) {
    await supabaseAdmin
      .from('orcamentos_salvos')
      .update({ bling_pedido_id: pedidoId })
      .eq('id', orc.id);
  }

  return res.status(200).json({
    ok: true,
    contatoId,
    pedidoId,
    pedidoNumero,
    total: totalPedido,
    itensSemBling: itensSemBling.length > 0 ? itensSemBling : undefined,
  });
}
