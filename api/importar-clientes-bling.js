import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/importar-clientes-bling
 *
 * Modos:
 *   mode: 'preview'  — retorna lista de vendedores encontrados nos pedidos
 *   mode: 'import'   — importa pedidos dos vendedores selecionados com dados completos
 *     { vendedores: ['Leo Berg'], dias_atras: 90 }
 *   mode: 'limpar'   — deleta todos os clientes com origem 'bling'
 */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Token Bling ─────────────────────────────────────────────────────────────

async function getBlingToken() {
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
  const config = await getBlingToken();
  if (!config) return null;
  const testRes = await fetch('https://api.bling.com.br/v3/pedidos/vendas?limite=1&pagina=1', {
    headers: { Authorization: `Bearer ${config.access_token}`, Accept: '1.0' },
  });
  if (testRes.status === 401) return await refreshBlingToken(config);
  return config.access_token;
}

async function blingGet(path, token) {
  return fetch(`https://api.bling.com.br/v3${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: '1.0' },
  });
}

async function fetchPedidos(token, dataInicioStr, maxPaginas = 10, idVendedor = null) {
  const pedidos = [];
  let pagina = 1;
  while (pagina <= maxPaginas) {
    await sleep(350);
    let url = `/pedidos/vendas?pagina=${pagina}&limite=100&dataInicial=${dataInicioStr}`;
    if (idVendedor) url += `&idVendedor=${idVendedor}`;
    const res = await blingGet(url, token);
    if (!res.ok) break;
    const json = await res.json();
    const items = json.data || [];
    pedidos.push(...items);
    if (items.length < 100) break;
    pagina++;
  }
  return pedidos;
}

function filtrarPorSituacao(pedidos, situacoesIds) {
  if (!situacoesIds || situacoesIds.length === 0) return pedidos;
  const idsSet = new Set(situacoesIds.map(Number));
  // A API do Bling retorna situacao.id como número — filtro direto por ID
  return pedidos.filter(p => idsSet.has(Number(p.situacao?.id)));
}

// ── Buscar detalhes completos do contato ─────────────────────────────────────

async function fetchContatoCompleto(contatoId, token) {
  if (!contatoId) return null;
  try {
    await sleep(250);
    const res = await blingGet(`/contatos/${contatoId}`, token);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (_) { return null; }
}

// ── Upsert cliente ────────────────────────────────────────────────────────────

async function upsertCliente(dados) {
  try {
    const telLimpo = (dados.telefone || '').replace(/\D/g, '') || null;
    const cpfLimpo = (dados.cpfCnpj || '').replace(/\D/g, '') || null;
    const agora = new Date().toISOString();

    let existente = null;
    if (cpfLimpo) {
      const { data } = await supabaseAdmin.from('clientes')
        .select('id, total_compras, total_gasto, data_primeira_compra')
        .eq('cpf_cnpj', cpfLimpo).maybeSingle();
      existente = data;
    }
    if (!existente && telLimpo) {
      const { data } = await supabaseAdmin.from('clientes')
        .select('id, total_compras, total_gasto, data_primeira_compra')
        .eq('telefone', telLimpo).maybeSingle();
      existente = data;
    }

    const valor = parseFloat(dados.valor || 0);
    const dataPedido = dados.data || agora;

    // Montar dados fiscais completos
    const dadosFiscais = {};
    if (dados.endereco) {
      dadosFiscais.logradouro = dados.endereco.endereco || '';
      dadosFiscais.numero = dados.endereco.numero || '';
      dadosFiscais.complemento = dados.endereco.complemento || '';
      dadosFiscais.bairro = dados.endereco.bairro || '';
      dadosFiscais.cidade = dados.endereco.municipio || '';
      dadosFiscais.estado = dados.endereco.uf || '';
      dadosFiscais.cep = dados.endereco.cep || '';
    }
    if (dados.nomeFantasia) dadosFiscais.nomeFantasia = dados.nomeFantasia;
    if (dados.ie) dadosFiscais.inscricaoEstadual = dados.ie;
    if (dados.dataNascimento) dadosFiscais.dataNascimento = dados.dataNascimento;

    if (existente) {
      await supabaseAdmin.from('clientes').update({
        ...(dados.nome && { nome: dados.nome }),
        ...(telLimpo && { telefone: telLimpo }),
        ...(cpfLimpo && { cpf_cnpj: cpfLimpo }),
        ...(dados.email && { email: dados.email }),
        ...(dados.tipoPessoa && { tipo_pessoa: dados.tipoPessoa }),
        origem: 'bling',
        dados_fiscais: dadosFiscais,
        data_ultima_compra: dataPedido,
        total_compras: (existente.total_compras || 0) + (valor > 0 ? 1 : 0),
        total_gasto: (parseFloat(existente.total_gasto) || 0) + valor,
        atualizado_em: agora,
      }).eq('id', existente.id);
      return 'atualizado';
    } else if (dados.nome || telLimpo) {
      await supabaseAdmin.from('clientes').insert({
        nome: dados.nome || 'Cliente Bling',
        telefone: telLimpo,
        email: dados.email || null,
        cpf_cnpj: cpfLimpo,
        tipo_pessoa: dados.tipoPessoa || 'F',
        dados_fiscais: dadosFiscais,
        origem: 'bling',
        total_compras: valor > 0 ? 1 : 0,
        total_gasto: valor > 0 ? valor : 0,
        data_primeira_compra: dataPedido,
        data_ultima_compra: dataPedido,
        criado_em: agora,
        atualizado_em: agora,
      });
      return 'criado';
    }
    return 'ignorado';
  } catch (e) {
    return 'erro';
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { mode = 'preview', dias_atras = 90, vendedores = [], situacoes = [9, 15], idVendedor = null } = req.body || {};

  // ── MODO: LIMPAR ──────────────────────────────────────────────────────────
  if (mode === 'limpar') {
    const { error, count } = await supabaseAdmin
      .from('clientes')
      .delete({ count: 'exact' })
      .eq('origem', 'bling');
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, deletados: count || 0 });
  }

  // Token Bling
  const token = await getValidToken();
  if (!token) return res.status(500).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });

  const dataInicio = new Date();
  dataInicio.setDate(dataInicio.getDate() - Number(dias_atras));
  const dataInicioStr = dataInicio.toISOString().split('T')[0];

  // ── Tabela de nomes conhecidos do Bling ────────────────────────────────────
  const BLING_SITUACOES_NOMES = {
    1:  'Pendente',
    3:  'Aprovado',
    6:  'Em aberto',
    9:  'Atendido',
    12: 'Em andamento',
    15: 'Verificado',
    21: 'Cancelado',
    24: 'Devolvido',
    27: 'Em digitação',
    57: 'Em aberto (NF)',
    63: 'Confirmado',
    69: 'Aguardando pagamento',
    75: 'Parcialmente atendido',
    81: 'Verificado NF',
  };

  // ── MODO: INSPECIONAR-CONTATO — busca contato por CPF/CNPJ e retorna campos completos ──
  if (mode === 'inspecionar-contato') {
    const { cpfCnpj } = req.body;
    const cpfLimpo = (cpfCnpj || '').replace(/\D/g, '');
    if (!cpfLimpo) return res.status(400).json({ ok: false, error: 'cpfCnpj obrigatório.' });

    // Buscar por CPF/CNPJ
    const searchRes = await blingGet(`/contatos?cpf_cnpj=${cpfLimpo}`, token);
    const searchJson = searchRes.ok ? await searchRes.json() : null;
    const contatos = searchJson?.data || [];

    if (contatos.length === 0) {
      return res.status(200).json({ ok: true, encontrado: false, contatos: [] });
    }

    // Buscar detalhe completo de cada contato encontrado (máx 3)
    const detalhes = [];
    for (const c of contatos.slice(0, 3)) {
      await sleep(250);
      const detRes = await blingGet(`/contatos/${c.id}`, token);
      const detJson = detRes.ok ? await detRes.json() : null;
      detalhes.push({
        id: c.id,
        resumo: c,
        detalheCompleto: detJson?.data || null,
        todosCampos: detJson?.data ? Object.keys(detJson.data) : [],
      });
    }

    return res.status(200).json({ ok: true, encontrado: true, total: contatos.length, contatos: detalhes });
  }

  // ── MODO: INSPECIONAR — retorna JSON cru para diagnóstico ─────────────────
  if (mode === 'inspecionar') {
    const pedidos = await fetchPedidos(token, dataInicioStr, 1);
    const amostra = pedidos.slice(0, 3);
    return res.status(200).json({
      ok: true,
      totalEncontrados: pedidos.length,
      amostra,
      campos: amostra.length > 0 ? {
        situacao: amostra[0].situacao,
        vendedor: amostra[0].vendedor,
        contato: amostra[0].contato,
        valorCampos: {
          total: amostra[0].total,
          totalVenda: amostra[0].totalVenda,
          valor: amostra[0].valor,
          totalPedido: amostra[0].totalPedido,
        },
        data: amostra[0].data,
        camposDisponiveis: Object.keys(amostra[0]),
      } : null,
    });
  }

  // ── MODO: INSPECIONAR-DETALHE — busca detalhe de 1 pedido para ver vendedor ─
  if (mode === 'inspecionar-detalhe') {
    const pedidos = await fetchPedidos(token, dataInicioStr, 1);
    if (pedidos.length === 0) {
      return res.status(200).json({ ok: false, error: 'Nenhum pedido encontrado no período.' });
    }
    // Busca detalhe completo do primeiro pedido
    const primeiroPedidoId = pedidos[0].id;
    const detRes = await blingGet(`/pedidos/vendas/${primeiroPedidoId}`, token);
    if (!detRes.ok) {
      return res.status(200).json({ ok: false, error: `Erro ao buscar detalhe: ${detRes.status}` });
    }
    const detJson = await detRes.json();
    const detalhe = detJson.data || {};
    // Extrair todos os vendedores únicos encontrados nos primeiros 50 pedidos
    const primeiros = pedidos.slice(0, 10);
    const vendedoresEncontrados = [];
    for (const p of primeiros) {
      await sleep(200);
      const r = await blingGet(`/pedidos/vendas/${p.id}`, token);
      if (r.ok) {
        const j = await r.json();
        const v = j.data?.vendedor;
        if (v) {
          const id = v.id || v.contato?.id;
          const nome = v.nome || v.contato?.nome || 'Sem nome';
          if (id && !vendedoresEncontrados.find(x => x.id === id)) {
            vendedoresEncontrados.push({ id, nome });
          }
        }
      }
    }
    return res.status(200).json({
      ok: true,
      primeiroPedidoId,
      vendedorNoPrimeiroPedido: detalhe.vendedor || null,
      camposDisponivelDetalhe: Object.keys(detalhe),
      vendedoresEncontrados,
    });
  }

  // ── MODO: USUARIOS — lista todos os vendedores do Bling ───────────────────
  if (mode === 'usuarios') {
    const vendedores = [];
    let pagina = 1;
    while (pagina <= 5) {
      await sleep(300);
      const r = await blingGet(`/vendedores?pagina=${pagina}&limite=100`, token);
      if (!r.ok) break;
      const j = await r.json();
      const items = j.data || [];
      for (const v of items) {
        vendedores.push({
          id: v.id,
          nome: v.contato?.nome || v.nome || `Vendedor ${v.id}`,
          situacao: v.contato?.situacao || 'A',
        });
      }
      if (items.length < 100) break;
      pagina++;
    }
    return res.status(200).json({ ok: true, vendedores, total: vendedores.length });
  }

  // ── MODO: STATUS — descobre situações únicas dos pedidos ───────────────────
  if (mode === 'status') {
    // Busca 5 páginas (500 pedidos) SEM filtro de situação para descobrir todos os status
    const pedidos = await fetchPedidos(token, dataInicioStr, 5);
    const situacoesMap = {};
    for (const pedido of pedidos) {
      const sit = pedido.situacao;
      if (sit?.id != null) {
        if (!situacoesMap[sit.id]) {
          const nomeConhecido = BLING_SITUACOES_NOMES[sit.id];
          situacoesMap[sit.id] = {
            id: sit.id,
            nome: nomeConhecido || sit.nome || `Status ${sit.id}`,
            total: 0,
          };
        }
        situacoesMap[sit.id].total++;
      }
    }
    const lista = Object.values(situacoesMap).sort((a, b) => b.total - a.total);
    return res.status(200).json({
      ok: true,
      situacoes: lista,
      totalPedidosAnalisados: pedidos.length,
      diasAtras: Number(dias_atras),
    });
  }

  // ── MODO: PREVIEW ─────────────────────────────────────────────────────────
  if (mode === 'preview') {
    // Busca até 3 páginas com filtro de vendedor (idVendedor) e status
    const todosPedidos = await fetchPedidos(token, dataInicioStr, 3, idVendedor || null);
    const pedidos = filtrarPorSituacao(todosPedidos, situacoes);

    // Contar clientes únicos
    const contatoIds = new Set();
    for (const p of pedidos) if (p.contato?.id) contatoIds.add(p.contato.id);

    return res.status(200).json({
      ok: true,
      totalPedidosAnalisados: pedidos.length,
      totalClientesUnicos: contatoIds.size,
      vendedores: [{ nome: 'Resumo', pedidos: pedidos.length, clientes: contatoIds.size, detalhe: [] }],
      diasAtras: Number(dias_atras),
      dataInicio: dataInicioStr,
      situacoesFiltradas: situacoes,
      idVendedorFiltrado: idVendedor,
    });
  }

  // ── MODO: IMPORT ──────────────────────────────────────────────────────────
  if (mode === 'import') {
    // Filtra pela API do Bling usando idVendedor (filtro server-side real)
    const todosPedidos = await fetchPedidos(token, dataInicioStr, 50, idVendedor || null);
    const pedidos = filtrarPorSituacao(todosPedidos, situacoes);

    // Coletar contatos únicos diretamente da listagem
    // A listagem já traz: contato.id, contato.nome, contato.tipoPessoa, contato.numeroDocumento (CPF/CNPJ)
    const contatosMap = {};

    for (const pedido of pedidos) {
      const contatoId = pedido.contato?.id;
      const nomeContato = pedido.contato?.nome || 'Cliente Bling';
      const tipoPessoaLista = pedido.contato?.tipoPessoa || 'F';
      // numeroDocumento já vem formatado (CPF ou CNPJ) na listagem
      const cpfCnpjLista = (pedido.contato?.numeroDocumento || '').replace(/\D/g, '');
      const valor = parseFloat(pedido.total || 0); // campo correto confirmado via debug
      const data = pedido.data ? new Date(pedido.data).toISOString() : new Date().toISOString();

      const key = String(contatoId || nomeContato);
      if (!contatosMap[key]) {
        contatosMap[key] = {
          contatoId,
          nome: nomeContato,
          tipoPessoa: tipoPessoaLista,
          cpfCnpjLista,
          valor: 0,
          data,
        };
      }
      contatosMap[key].valor += valor;
      if (data > contatosMap[key].data) contatosMap[key].data = data;
    }

    // Para cada contato único, buscar detalhes adicionais (telefone, email, endereço)
    let totalCriados = 0;
    let totalAtualizados = 0;
    const contatosUnicos = Object.values(contatosMap);

    for (const contato of contatosUnicos) {
      let telefone = '';
      let cpfCnpj = contato.cpfCnpjLista; // CPF/CNPJ já disponível da listagem
      let email = '';
      let tipoPessoa = contato.tipoPessoa;
      let endereco = null;
      let nomeFantasia = '';
      let ie = '';
      let dataNascimento = '';

      // Buscar telefone, email e endereço (não disponíveis na listagem)
      if (contato.contatoId) {
        const detalhes = await fetchContatoCompleto(contato.contatoId, token);
        if (detalhes) {
          telefone = detalhes.celular || detalhes.telefone || detalhes.fone || '';
          // Usar CPF/CNPJ do detalhe se vier mais completo
          const cpfDetalhe = (detalhes.cpf || detalhes.cnpj || '').replace(/\D/g, '');
          if (cpfDetalhe) cpfCnpj = cpfDetalhe;
          email = detalhes.email || '';
          tipoPessoa = detalhes.tipoPessoa || tipoPessoa;
          endereco = detalhes.endereco || null;
          nomeFantasia = detalhes.fantasia || '';
          ie = detalhes.ie || detalhes.rg || '';
          dataNascimento = detalhes.dataNascimento || '';
          if (detalhes.nome) contato.nome = detalhes.nome;
        }
      }

      const resultado = await upsertCliente({
        nome: contato.nome,
        telefone,
        cpfCnpj,
        email,
        tipoPessoa,
        valor: contato.valor,
        data: contato.data,
        endereco,
        nomeFantasia,
        ie,
        dataNascimento,
      });

      if (resultado === 'criado') totalCriados++;
      else if (resultado === 'atualizado') totalAtualizados++;
    }

    return res.status(200).json({
      ok: true,
      totalPedidos: pedidos.length,
      totalClientes: contatosUnicos.length,
      criados: totalCriados,
      atualizados: totalAtualizados,
    });
  }

  return res.status(400).json({ ok: false, error: 'Modo inválido. Use: preview | import | limpar' });
}
