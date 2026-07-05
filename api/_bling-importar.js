import { createClient } from '@supabase/supabase-js';
import { log } from './_log.js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Shared Bling Token Helpers ────────────────────────────────────────────────

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

async function getValidToken(isProductQuery = false) {
  const config = await getBlingToken();
  if (!config) return null;
  
  const testUrl = isProductQuery 
    ? 'https://api.bling.com.br/v3/produtos?limite=1&pagina=1'
    : 'https://api.bling.com.br/v3/pedidos/vendas?limite=1&pagina=1';

  const testRes = await fetch(testUrl, {
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

// ── PRODUCTS IMPORT SPECIFIC HELPERS ──────────────────────────────────────────

async function fetchProdutosLista(token, maxPaginas = 20, apenasAtivos = true) {
  const produtos = [];
  let pagina = 1;
  while (pagina <= maxPaginas) {
    await sleep(350);
    const situacaoParam = apenasAtivos ? '&situacao=A' : '';
    const res = await blingGet(`/produtos?pagina=${pagina}&limite=100${situacaoParam}`, token);
    if (!res.ok) break;
    const json = await res.json();
    const items = json.data || [];
    produtos.push(...items);
    if (items.length < 100) break;
    pagina++;
  }
  return produtos;
}

async function fetchProdutoDetalhe(produtoId, token) {
  if (!produtoId) return null;
  try {
    await sleep(250);
    const res = await blingGet(`/produtos/${produtoId}`, token);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (_) { return null; }
}

function extrairImagemUrl(produto) {
  if (Array.isArray(produto.imagens) && produto.imagens.length > 0) {
    const principal = produto.imagens.find(i => i.principal) || produto.imagens[0];
    if (principal?.link) return principal.link;
    if (principal?.url) return principal.url;
  }
  if (produto.imagemURL) return produto.imagemURL;
  if (produto.imagem) return produto.imagem;
  return null;
}

function mapearCategoria(nomeCategoriaBlng, catsCache, subsCache) {
  if (!nomeCategoriaBlng) return { categoria: null, subcategoria: null };
  const nomeNorm = nomeCategoriaBlng.trim().toLowerCase();
  const catMatch = catsCache.find(c => c.nome.toLowerCase() === nomeNorm);
  if (catMatch) return { categoria: catMatch.nome, subcategoria: null };
  const subMatch = subsCache.find(s => s.nome.toLowerCase() === nomeNorm);
  if (subMatch) return { categoria: null, subcategoria: subMatch.nome };
  return { categoria: null, subcategoria: null };
}

async function upsertProduto(dados) {
  try {
    let existente = null;
    if (dados.codigo_sku) {
      const { data } = await supabaseAdmin
        .from('produtos')
        .select('id, url_imagem')
        .eq('codigo_sku', dados.codigo_sku)
        .maybeSingle();
      existente = data;
    }
    const urlImagemFinal = dados.url_imagem || existente?.url_imagem || null;
    const payloadBase = {
      nome: dados.nome || 'Produto Bling',
      codigo_sku: dados.codigo_sku || null,
      preco: dados.preco || 0,
      preco_avista: dados.preco_avista || null,
      preco_prazo: dados.preco_prazo || null,
      peso_kg: dados.peso_kg || null,
      url_imagem: urlImagemFinal,
      categoria: dados.categoria || null,
      subcategoria: dados.subcategoria || null,
    };
    const payloadFull = { ...payloadBase, origem: 'bling', bling_id: dados.bling_id || null };

    if (existente) {
      const { error } = await supabaseAdmin.from('produtos').update(payloadFull).eq('id', existente.id);
      if (error) {
        await supabaseAdmin.from('produtos').update(payloadBase).eq('id', existente.id);
      }
      return 'atualizado';
    } else {
      const { error } = await supabaseAdmin.from('produtos').insert(payloadFull);
      if (error) {
        await supabaseAdmin.from('produtos').insert(payloadBase);
      }
      return 'criado';
    }
  } catch (e) {
    console.error('Erro upsert produto:', e.message);
    return 'erro';
  }
}

// ── CLIENTS IMPORT SPECIFIC HELPERS ───────────────────────────────────────────

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
  return pedidos.filter(p => idsSet.has(Number(p.situacao?.id)));
}

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

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { type, mode = 'preview' } = req.body || {};

  // ────────────────────────────────────────────────────────────────────────────
  // 1. IMPORTAÇÃO DE PRODUTOS
  // ────────────────────────────────────────────────────────────────────────────
  if (type === 'produtos') {
    const { apenasAtivos = true } = req.body || {};

    if (mode === 'limpar') {
      const { error, count } = await supabaseAdmin
        .from('produtos')
        .delete({ count: 'exact' })
        .eq('origem', 'bling');
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, deletados: count || 0 });
    }

    const token = await getValidToken(true);
    if (!token) return res.status(500).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });

    if (mode === 'inspecionar') {
      const lista = await fetchProdutosLista(token, 1, false);
      const amostra = lista.slice(0, 3);
      const detalhe = amostra.length > 0 ? await fetchProdutoDetalhe(amostra[0].id, token) : null;
      return res.status(200).json({
        ok: true,
        totalListagem: lista.length,
        camposListagem: amostra[0] ? Object.keys(amostra[0]) : [],
        camposDetalhe: detalhe ? Object.keys(detalhe) : [],
        imagemListagem: amostra[0] ? { imagemURL: amostra[0].imagemURL, imagem: amostra[0].imagem } : null,
        imagemDetalhe: detalhe ? { imagens: detalhe.imagens, imagemURL: detalhe.imagemURL } : null,
        precos: detalhe ? { preco: detalhe.preco, precoCusto: detalhe.precoCusto, precoVenda: detalhe.precoVenda } : null,
        categoria: detalhe?.categoria || null,
        amostra: amostra,
      });
    }

    if (mode === 'preview') {
      const produtos = await fetchProdutosLista(token, 20, apenasAtivos);
      const codigos = produtos.map(p => p.codigo).filter(Boolean);

      const { data: existentes } = await supabaseAdmin
        .from('produtos')
        .select('codigo_sku')
        .in('codigo_sku', codigos.length > 0 ? codigos : ['__nenhum__']);

      const existentesSet = new Set((existentes || []).map(e => e.codigo_sku));
      const novos = produtos.filter(p => p.codigo && !existentesSet.has(p.codigo));
      const jaExistem = produtos.filter(p => p.codigo && existentesSet.has(p.codigo));
      const semCodigo = produtos.filter(p => !p.codigo);

      return res.status(200).json({
        ok: true,
        totalBling: produtos.length,
        novos: novos.length,
        jaExistem: jaExistem.length,
        semCodigo: semCodigo.length,
        seraoImportados: produtos.length - semCodigo.length,
      });
    }

    if (mode === 'import') {
      const lista = await fetchProdutosLista(token, 20, apenasAtivos);
      const produtosComCodigo = lista.filter(p => p.codigo);

      const { data: catsCache = [] } = await supabaseAdmin.from('categorias').select('nome');
      const { data: subsCache = [] } = await supabaseAdmin.from('subcategorias').select('nome');
      log('importar-produtos', 'info', 'Cache de categorias carregado', { cats: catsCache.length, subs: subsCache.length });

      let criados = 0, atualizados = 0, erros = 0, semFoto = 0;

      for (const item of produtosComCodigo) {
        const detalhe = await fetchProdutoDetalhe(item.id, token);
        const produto = detalhe || item;

        const urlImagem = extrairImagemUrl(produto);
        if (!urlImagem) semFoto++;

        const nomeCat = produto.categoria?.descricao || produto.categoria?.nome || null;
        const { categoria, subcategoria } = mapearCategoria(nomeCat, catsCache ?? [], subsCache ?? []);

        const preco = parseFloat(produto.preco || produto.precoVenda || 0);
        const pesoBruto = parseFloat(produto.pesoBruto || produto.pesoLiquido || produto.peso_kg || 0);

        const resultado = await upsertProduto({
          bling_id: item.id,
          codigo_sku: item.codigo,
          nome: produto.nome || item.nome,
          preco,
          peso_kg: pesoBruto > 0 ? pesoBruto : null,
          url_imagem: urlImagem,
          categoria,
          subcategoria,
        });

        if (resultado === 'criado') criados++;
        else if (resultado === 'atualizado') atualizados++;
        else erros++;
      }

      log('importar-produtos', 'info', 'Import concluído', { criados, atualizados, erros, semFoto });
      return res.status(200).json({
        ok: true,
        totalBling: lista.length,
        processados: produtosComCodigo.length,
        criados,
        atualizados,
        semFoto,
        erros,
        ignorados: lista.length - produtosComCodigo.length,
      });
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 2. IMPORTAÇÃO DE CLIENTES
  // ────────────────────────────────────────────────────────────────────────────
  if (type === 'clientes') {
    const { dias_atras = 90, situacoes = [9, 15], idVendedor = null } = req.body || {};

    if (mode === 'limpar') {
      const { error, count } = await supabaseAdmin
        .from('clientes')
        .delete({ count: 'exact' })
        .eq('origem', 'bling');
      if (error) return res.status(500).json({ ok: false, error: error.message });
      return res.status(200).json({ ok: true, deletados: count || 0 });
    }

    const token = await getValidToken(false);
    if (!token) return res.status(500).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });

    const dataInicio = new Date();
    dataInicio.setDate(dataInicio.getDate() - Number(dias_atras));
    const dataInicioStr = dataInicio.toISOString().split('T')[0];

    const BLING_SITUACOES_NOMES = {
      1:  'Pendente', 3:  'Aprovado', 6:  'Em aberto', 9:  'Atendido', 12: 'Em andamento',
      15: 'Verificado', 21: 'Cancelado', 24: 'Devolvido', 27: 'Em digitação',
      57: 'Em aberto (NF)', 63: 'Confirmado', 69: 'Aguardando pagamento',
      75: 'Parcialmente atendido', 81: 'Verificado NF',
    };

    if (mode === 'inspecionar-contato') {
      const { cpfCnpj } = req.body;
      const cpfLimpo = (cpfCnpj || '').replace(/\D/g, '');
      if (!cpfLimpo) return res.status(400).json({ ok: false, error: 'cpfCnpj obrigatório.' });

      const searchRes = await blingGet(`/contatos?cpf_cnpj=${cpfLimpo}`, token);
      const searchJson = searchRes.ok ? await searchRes.json() : null;
      const contatos = searchJson?.data || [];

      if (contatos.length === 0) {
        return res.status(200).json({ ok: true, encontrado: false, contatos: [] });
      }

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

    if (mode === 'inspecionar-detalhe') {
      const pedidos = await fetchPedidos(token, dataInicioStr, 1);
      if (pedidos.length === 0) return res.status(200).json({ ok: false, error: 'Nenhum pedido encontrado no período.' });
      
      const detRes = await blingGet(`/pedidos/vendas/${pedidos[0].id}`, token);
      if (!detRes.ok) return res.status(200).json({ ok: false, error: `Erro ao buscar detalhe: ${detRes.status}` });
      const detJson = await detRes.json();
      const detalhe = detJson.data || {};

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
        primeiroPedidoId: pedidos[0].id,
        vendedorNoPrimeiroPedido: detalhe.vendedor || null,
        vendedoresEncontrados,
      });
    }

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

    if (mode === 'status') {
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
      return res.status(200).json({ ok: true, situacoes: lista, totalPedidosAnalisados: pedidos.length });
    }

    if (mode === 'preview') {
      const todosPedidos = await fetchPedidos(token, dataInicioStr, 3, idVendedor || null);
      const pedidos = filtrarPorSituacao(todosPedidos, situacoes);
      const contatoIds = new Set();
      for (const p of pedidos) if (p.contato?.id) contatoIds.add(p.contato.id);

      return res.status(200).json({
        ok: true,
        totalPedidosAnalisados: pedidos.length,
        totalClientesUnicos: contatoIds.size,
        vendedores: [{ nome: 'Resumo', pedidos: pedidos.length, clientes: contatoIds.size, detalhe: [] }],
      });
    }

    if (mode === 'import') {
      const todosPedidos = await fetchPedidos(token, dataInicioStr, 50, idVendedor || null);
      const pedidos = filtrarPorSituacao(todosPedidos, situacoes);
      const contatosMap = {};

      for (const pedido of pedidos) {
        const contatoId = pedido.contato?.id;
        const nomeContato = pedido.contato?.nome || 'Cliente Bling';
        const tipoPessoaLista = pedido.contato?.tipoPessoa || 'F';
        const cpfCnpjLista = (pedido.contato?.numeroDocumento || '').replace(/\D/g, '');
        const valor = parseFloat(pedido.total || 0);
        const data = pedido.data ? new Date(pedido.data).toISOString() : new Date().toISOString();

        const key = String(contatoId || nomeContato);
        if (!contatosMap[key]) {
          contatosMap[key] = { contatoId, nome: nomeContato, tipoPessoa: tipoPessoaLista, cpfCnpjLista, valor: 0, data };
        }
        contatosMap[key].valor += valor;
        if (data > contatosMap[key].data) contatosMap[key].data = data;
      }

      let totalCriados = 0, totalAtualizados = 0;
      const contatosUnicos = Object.values(contatosMap);

      for (const contato of contatosUnicos) {
        let telefone = '', cpfCnpj = contato.cpfCnpjLista, email = '', tipoPessoa = contato.tipoPessoa, endereco = null, nomeFantasia = '', ie = '', dataNascimento = '';

        if (contato.contatoId) {
          const detalhes = await fetchContatoCompleto(contato.contatoId, token);
          if (detalhes) {
            telefone = detalhes.celular || detalhes.telefone || detalhes.fone || '';
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
          nome: contato.nome, telefone, cpfCnpj, email, tipoPessoa, valor: contato.valor, data: contato.data, endereco, nomeFantasia, ie, dataNascimento,
        });

        if (resultado === 'criado') totalCriados++;
        else if (resultado === 'atualizado') totalAtualizados++;
      }

      return res.status(200).json({ ok: true, totalPedidos: pedidos.length, totalClientes: contatosUnicos.length, criados: totalCriados, atualizados: totalAtualizados });
    }
  }

  return res.status(400).json({ ok: false, error: 'Parâmetro "type" inválido. Use "produtos" ou "clientes".' });
}
