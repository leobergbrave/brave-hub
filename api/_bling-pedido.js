import { createClient } from '@supabase/supabase-js';
import { buscarContatoBling } from './_bling-contato-busca.js';

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

  // Fiscal form data stored inside orcamento payload (filled by client after sale)
  const dfFiscal = orc.payload?.dadosFiscais || {};

  // CPF: priority to clientes.cpf_cnpj, fallback to fiscal form data
  const cpfLimpo = (
    (cliente.cpf_cnpj || '').replace(/\D/g, '') ||
    (dfFiscal.cpfCnpj || '').replace(/\D/g, '')
  );

  // Address: fiscal form as base (more complete), client dados_fiscais overrides if set
  const df = { ...dfFiscal, ...(cliente.dados_fiscais || {}) };
  // O Bling valida documento x tipo: CPF (11 digitos) exige F, CNPJ (14) exige J.
  // Documento com tamanho invalido e descartado, senao o cadastro e recusado.
  const tipoDoc = cpfLimpo.length === 14 ? 'J' : cpfLimpo.length === 11 ? 'F' : null;
  const docValido = tipoDoc ? cpfLimpo : '';
  const isPJ = tipoDoc ? tipoDoc === 'J' : (cliente.tipo_pessoa || dfFiscal.tipoPessoa || 'F') === 'J';

  // Persist CPF back to client record if it was found from the fiscal form but missing in clientes
  if (!cliente.cpf_cnpj && cpfLimpo) {
    supabaseAdmin.from('clientes')
      .update({ cpf_cnpj: cpfLimpo, atualizado_em: new Date().toISOString() })
      .eq('id', clienteId)
      .then(() => {}).catch(() => {});
  }

  // 4. Buscar contato existente no Bling (documento → email → nome).
  // Ver _bling-contato-busca.js: o filtro ?cpf_cnpj= da v3 e ignorado.
  await sleep(300);
  const achado = await buscarContatoBling(
    (path) => blingRequest(`https://api.bling.com.br/v3${path}`, 'GET', null, token),
    { documento: cpfLimpo, nome: cliente.nome, email: cliente.email }
  );
  let contatoId = achado?.id || null;
  if (achado) console.log('[Bling contato] Encontrado via', achado.via, '→', achado.id, achado.nome);

  // 5. Criar ou atualizar contato no Bling
  // Bling v3: o documento vai em numeroDocumento (cpfCnpj era a API antiga — a v3
  // ignora) e o endereço precisa ir aninhado em endereco.geral (plano é descartado).
  const enderecoBling = {
    endereco: df.logradouro || '',
    numero: df.numero || '',
    complemento: df.complemento || '',
    bairro: df.bairro || '',
    municipio: df.cidade || '',
    uf: df.estado || '',
    cep: (df.cep || '').replace(/\D/g, ''),
  };
  const contatoPayload = {
    nome: cliente.nome,
    tipo: isPJ ? 'J' : 'F',
    situacao: 'A',
    email: cliente.email || '',
    emailNotaFiscal: cliente.email || '',
    telefone: cliente.telefone || '',
    celular: cliente.telefone || '',
    ...(docValido ? { numeroDocumento: docValido } : {}),
    ...(isPJ
      ? { fantasia: df.nomeFantasia || '', ie: df.inscricaoEstadual || '' }
      : {}),
    ...(!isPJ && df.dataNascimento ? { dadosAdicionais: { dataNascimento: df.dataNascimento } } : {}),
    endereco: { geral: enderecoBling, cobranca: enderecoBling },
  };

  await sleep(300);
  if (contatoId) {
    const updRes = await blingRequest(`https://api.bling.com.br/v3/contatos/${contatoId}`, 'PUT', contatoPayload, token);
    console.log('[Bling contato] Atualizado:', contatoId, 'status:', updRes?.status);
  } else {
    const createRes = await blingRequest('https://api.bling.com.br/v3/contatos', 'POST', contatoPayload, token);
    const createBody = await createRes?.text?.() || '';
    console.log('[Bling contato] Criado status:', createRes?.status, 'body:', createBody.slice(0, 300));
    if (createRes?.ok) {
      try { contatoId = JSON.parse(createBody).data?.id || null; } catch (_) {}
    } else {
      return res.status(200).json({ ok: false, error: `Erro ao criar contato no Bling: ${createBody}` });
    }
  }

  if (!contatoId) {
    return res.status(200).json({
      ok: false,
      error: 'Não foi possível criar/encontrar o contato no Bling. Verifique CPF/CNPJ ou email do cliente.',
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

  // 7. Montar itens da proposta
  const itensSemBling = [];
  const itens = itensRaw
    .filter(i => (i.q ?? i.quantidade ?? 0) > 0)
    .map(i => {
      const prod = prodMap[i.id];
      const quantidade = Number(i.q ?? i.quantidade ?? 1);
      const valor = parseFloat(i.p ?? i.preco ?? 0);
      const descricao = prod?.nome || i.nome || 'Produto';
      const blingId = prod?.bling_id ? Number(prod.bling_id) : null;
      if (!blingId) itensSemBling.push(descricao);
      return {
        codigo: prod?.codigo_sku || '',
        descricao,
        unidade: 'UN',
        quantidade,
        valor: Number(valor.toFixed(2)),
        desconto: 0,
        produto: blingId ? { id: blingId } : { descricao },
      };
    });

  if (itens.length === 0) {
    return res.status(200).json({ ok: false, error: 'Orçamento sem itens com quantidade > 0.' });
  }

  // 8. Buscar vendedor no Bling (obrigatorio para propostas-comerciais)
  //
  // A versao antiga fazia .toLowerCase().includes("leo") — mas "Léo Berg" em
  // minusculas continua "léo berg" (o E tem acento), entao NUNCA casava, e o
  // fallback lista[0] pegava o primeiro vendedor da conta (Lais Carlos). Por isso
  // as propostas saiam no nome errado.
  //
  // Agora: BLING_VENDEDOR_ID (se definido) manda; senao match por nome SEM acento,
  // exato e depois parcial inequivoco. Sem match, erra explicito em vez de
  // atribuir a proposta a outra pessoa em silencio.
  const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const alvoVend = semAcento(orc.consultor || 'Leo Berg');

  let idVendedor = null;
  let vendedorNome = null;
  const idFixoVend = process.env.BLING_VENDEDOR_ID;
  if (idFixoVend) {
    idVendedor = isNaN(Number(idFixoVend)) ? idFixoVend : Number(idFixoVend);
    vendedorNome = `(fixo por BLING_VENDEDOR_ID)`;
  } else {
    await sleep(300);
    const vendRes = await blingRequest("https://api.bling.com.br/v3/vendedores", "GET", null, token);
    if (vendRes?.ok) {
      const vendData = await vendRes.json();
      const lista = (vendData?.data || []).filter(v => (v?.contato?.nome || '').trim());
      let match = lista.find(v => semAcento(v.contato.nome) === alvoVend);
      if (!match && alvoVend.length >= 3) {
        const parciais = lista.filter(v => {
          const n = semAcento(v.contato.nome);
          return n.length >= 3 && (n.includes(alvoVend) || alvoVend.includes(n));
        });
        if (parciais.length === 1) match = parciais[0]; // so aceita se for inequivoco
      }
      if (match) { idVendedor = match.id; vendedorNome = match.contato.nome; }
    }
  }
  if (!idVendedor) {
    return res.status(200).json({
      ok: false,
      error: `Vendedor "${orc.consultor || 'Léo Berg'}" não encontrado no Bling. Confira o nome do consultor no orçamento (ou defina BLING_VENDEDOR_ID).`,
    });
  }
  console.log('[Bling proposta] vendedor:', idVendedor, vendedorNome);

  // 9. Calcular total
  const totalItens = itens.reduce((acc, i) => acc + i.valor * i.quantidade, 0);
  const frete = parseFloat(orc.payload?.frete || 0);
  const totalProposta = Math.round((totalItens + frete) * 100) / 100;

  // 10. Criar proposta comercial no Bling
  const propostaPayload = {
    contato: { id: Number(contatoId) },
    vendedor: { id: idVendedor },
    itens,
    transporte: { fretePorConta: 0, frete: frete > 0 ? frete : 0 },
    observacaoInterna: `Gerado via Brave Hub · Orçamento: ${orcamentoSlug} · ${new Date().toLocaleString('pt-BR')}`,
  };

  await sleep(300);
  const propostaRes = await blingRequest(
    'https://api.bling.com.br/v3/propostas-comerciais', 'POST', propostaPayload, token
  );

  const propostaStatus = propostaRes?.status;
  const propostaBodyRaw = await propostaRes?.text?.() || '';
  console.log('[Bling proposta]', { status: propostaStatus, body: propostaBodyRaw.slice(0, 500) });

  if (!propostaRes?.ok) {
    return res.status(200).json({
      ok: false,
      error: `Erro ao criar proposta no Bling (HTTP ${propostaStatus}): ${propostaBodyRaw}`,
    });
  }

  let propostaId = null;
  let propostaNumero = null;
  try {
    const propostaJson = JSON.parse(propostaBodyRaw);
    propostaId = propostaJson.data?.id || null;
    propostaNumero = propostaJson.data?.numero || propostaJson.data?.numeroProposta || null;
  } catch (_) {}

  // 11. Salvar bling_pedido_id e cliente_id no orçamento
  if (propostaId) {
    await supabaseAdmin
      .from('orcamentos_salvos')
      .update({ bling_pedido_id: propostaId, cliente_id: clienteId })
      .eq('id', orc.id);
  }

  return res.status(200).json({
    ok: true,
    contatoId,
    propostaId,
    propostaNumero,
    vendedor: vendedorNome,
    total: totalProposta,
    itensSemBling: itensSemBling.length > 0 ? itensSemBling : undefined,
  });
}
