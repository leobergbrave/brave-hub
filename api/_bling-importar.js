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

    // Corrige as linhas locais corrompidas (preco=0, peso com valor de preço, nome
    // truncado — herança de importação antiga). Cirúrgico: SÓ mexe em produtos com
    // preco<=0 que casam por SKU no Bling; preços curados manualmente ficam intactos.
    if (mode === 'corrigir-variantes') {
      const { data: corrompidos } = await supabaseAdmin
        .from('produtos')
        .select('id, codigo_sku, nome, preco, peso_kg')
        .or('preco.is.null,preco.lte.0')
        .not('codigo_sku', 'is', null);
      const alvo = (corrompidos || []).filter(p => (p.codigo_sku || '').trim());
      if (!alvo.length) return res.status(200).json({ ok: true, corrigidos: 0, mensagem: 'Nenhum produto com preço zerado.' });

      // mapa codigo→produto da listagem completa do Bling (a lista já traz o preço)
      const listaBling = await fetchProdutosLista(token, 20, false);
      const porCodigo = new Map();
      for (const b of listaBling) if (b.codigo) porCodigo.set(String(b.codigo).trim().toUpperCase(), b);

      let corrigidos = 0, semPeso = 0;
      const naoEncontrados = [];
      const erros = [];
      for (const local of alvo) {
        // SKUs locais usam ponto (DBO17.5); no Bling estao com virgula (DBO17,5)
        const skuUp = local.codigo_sku.trim().toUpperCase();
        const b = porCodigo.get(skuUp)
          || porCodigo.get(skuUp.replace(/\./g, ','))
          || porCodigo.get(skuUp.replace(/,/g, '.'));
        if (!b || !(parseFloat(b.preco) > 0)) { naoEncontrados.push(local.codigo_sku); continue; }
        // peso real só existe no detalhe
        const det = await fetchProdutoDetalhe(b.id, token);
        const peso = parseFloat(det?.pesoBruto || det?.pesoLiquido || 0);
        if (!(peso > 0)) semPeso++;
        // sem bling_id: a coluna pode nao existir (mesmo fallback do upsertProduto)
        const { error } = await supabaseAdmin.from('produtos').update({
          preco: parseFloat(b.preco),
          ...(peso > 0 ? { peso_kg: peso } : {}),
          ...(det?.nome ? { nome: det.nome } : {}),
        }).eq('id', local.id);
        if (!error) corrigidos++;
        else if (erros.length < 5) erros.push(`${local.codigo_sku}: ${error.message}`);
      }

      log('corrigir-variantes', 'info', 'Correção concluída', { alvo: alvo.length, corrigidos, semPeso, naoEncontrados: naoEncontrados.length });
      return res.status(200).json({
        ok: true, alvo: alvo.length, corrigidos, semPeso, erros,
        naoEncontrados: naoEncontrados.slice(0, 60),
        totalNaoEncontrados: naoEncontrados.length,
      });
    }

    // Importa SÓ os produtos do Bling que ainda não existem localmente (por SKU).
    // Usa apenas a listagem (rápido, sem detalhe por produto — não estoura timeout);
    // o peso vem parseado do nome ("...32kg" → 32; "...25LB" → 11.3).
    if (mode === 'importar-faltantes') {
      const lista = await fetchProdutosLista(token, 20, true);
      const comCodigo = lista.filter(p => p.codigo && String(p.codigo).trim());

      const { data: locais } = await supabaseAdmin.from('produtos').select('codigo_sku');
      const locaisSet = new Set((locais || []).map(l => (l.codigo_sku || '').trim().toUpperCase()));
      // considera ponto/vírgula equivalentes (DBO17.5 ≡ DBO17,5)
      const temLocal = (sku) => {
        const s = sku.trim().toUpperCase();
        return locaisSet.has(s) || locaisSet.has(s.replace(/,/g, '.')) || locaisSet.has(s.replace(/\./g, ','));
      };

      const pesoDoNome = (nome) => {
        const m = String(nome || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|lb)s?\b/i);
        if (!m) return null;
        const n = parseFloat(m[1].replace(',', '.'));
        if (!(n > 0)) return null;
        return m[2].toLowerCase() === 'lb' ? Math.round(n * 0.4536 * 10) / 10 : n;
      };

      const novos = comCodigo.filter(b => !temLocal(String(b.codigo)));
      /* bling_id e obrigatorio: sem ele a proposta manda o item como texto
         livre e o Bling nao mostra codigo nem imagem. Era o que este modo
         fazia — inseria so nome/SKU/preco/peso — e deixou 161 produtos orfaos. */
      const linhas = novos.map(b => ({
        nome: b.nome || 'Produto Bling',
        codigo_sku: String(b.codigo).trim(),
        preco: parseFloat(b.preco) || 0,
        peso_kg: pesoDoNome(b.nome),
        bling_id: b.id || null,
      }));

      let inseridos = 0;
      const errosIns = [];
      for (let i = 0; i < linhas.length; i += 100) {
        const lote = linhas.slice(i, i + 100);
        const { error, count } = await supabaseAdmin.from('produtos').insert(lote, { count: 'exact' });
        if (error) { if (errosIns.length < 3) errosIns.push(error.message); continue; }
        inseridos += count ?? lote.length;
      }

      log('importar-faltantes', 'info', 'Concluído', { totalBling: comCodigo.length, novos: novos.length, inseridos });
      return res.status(200).json({
        ok: true, totalBling: comCodigo.length, jaExistiam: comCodigo.length - novos.length,
        novos: novos.length, inseridos, semPreco: linhas.filter(l => !(l.preco > 0)).length,
        erros: errosIns,
      });
    }

    // Inspeção pontual: como o Bling devolve UM produto específico (por SKU)?
    // Usado pra diagnosticar variantes com preco=0 / peso trocado. Só leitura.
    /* Vincula ao Bling os produtos locais que ficaram sem bling_id. Sem esse
       vinculo a proposta sai com o item como TEXTO LIVRE — e o Bling descarta
       o codigo e nao tem de onde tirar a imagem (era o defeito relatado em
       04/09/2026: 161 dos 955 produtos orfaos, 29% dos orcamentos afetados).
       Casa por SKU numa unica varredura da lista do Bling, em vez de uma
       consulta por produto: 161 chamadas viravam minutos e estouravam o
       limite de requisicoes. */
    if (mode === 'vincular-blingid') {
      const { data: orfaos } = await supabaseAdmin
        .from('produtos')
        .select('id, codigo_sku, nome')
        .is('bling_id', null)
        .not('codigo_sku', 'is', null);

      const pendentes = (orfaos || []).filter((p) => (p.codigo_sku || '').trim());
      if (!pendentes.length) return res.status(200).json({ ok: true, orfaos: 0, vinculados: 0, naoEncontrados: [] });

      // Inclui inativos: produto arquivado no Bling continua valendo para
      // propostas antigas, e vincular e melhor do que deixar como texto livre.
      const lista = await fetchProdutosLista(token, 30, false);
      const porSku = new Map();
      for (const b of lista) {
        const c = String(b.codigo || '').trim().toUpperCase();
        if (c && b.id && !porSku.has(c)) porSku.set(c, b.id);
      }
      // O Bling e o HUB divergem em ponto/virgula no SKU (DBO17.5 vs DBO17,5)
      const acharId = (sku) => {
        const s = String(sku).trim().toUpperCase();
        return porSku.get(s) || porSku.get(s.replace(/,/g, '.')) || porSku.get(s.replace(/\./g, ',')) || null;
      };

      let vinculados = 0;
      const naoEncontrados = [];
      const erros = [];
      for (const local of pendentes) {
        const blingId = acharId(local.codigo_sku);
        if (!blingId) { naoEncontrados.push(local.codigo_sku); continue; }
        const { error } = await supabaseAdmin.from('produtos').update({ bling_id: blingId }).eq('id', local.id);
        if (error) { if (erros.length < 5) erros.push(`${local.codigo_sku}: ${error.message}`); }
        else vinculados++;
      }

      return res.status(200).json({
        ok: true,
        orfaos: pendentes.length,
        vinculados,
        naoEncontrados: naoEncontrados.slice(0, 40),
        totalNaoEncontrados: naoEncontrados.length,
        ...(erros.length ? { erros } : {}),
      });
    }

    /* Remove as linhas DUPLICADAS que sobraram sem vinculo. O mesmo produto
       foi cadastrado duas vezes com SKUs equivalentes (DBO27.5 x DBO27,5, as
       vezes identicos), e como o Bling so aceita um produto local por produto
       dele, o gemeo ja ficou com o bling_id — a copia orfa nunca vincula e,
       se for escolhida no orcamento, a proposta sai sem codigo e sem imagem.
       So apaga na base LOCAL: nada e enviado ao Bling, onde o produto continua
       existindo (e por isso que o gemeo aponta para la).
       Sem `confirmar: true` apenas simula e devolve o que seria apagado. */
    if (mode === 'limpar-duplicados-orfaos') {
      const { confirmar = false } = req.body || {};
      const { data: todos } = await supabaseAdmin
        .from('produtos')
        .select('id, codigo_sku, nome, bling_id, preco');

      const norm = (sku) => String(sku || '').trim().toUpperCase().replace(/,/g, '.');
      /* Pelo NOME tambem: o SKU errado nem sempre e so ponto/virgula — veio
         hifen fora do lugar (MESAFLEXLT- x MESAFLEX-LT) e simbolo trocado
         (45° x 45º). Normalizando so letras e numeros, a copia redundante
         aparece; produto de nome REALMENTE diferente (Bulgarian renomeada no
         Bling, Fat Bar 1,50 x 1,80) fica de fora de proposito — esses exigem
         decisao humana, nao exclusao automatica. */
      const normNome = (n) => String(n || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

      const vinculadoPorSku = new Map();
      const vinculadoPorNome = new Map();
      for (const p of todos || []) {
        if (!p.bling_id) continue;
        const k = norm(p.codigo_sku);
        if (k && !vinculadoPorSku.has(k)) vinculadoPorSku.set(k, p);
        const kn = normNome(p.nome);
        if (kn && !vinculadoPorNome.has(kn)) vinculadoPorNome.set(kn, p);
      }

      const alvos = [];
      for (const p of todos || []) {
        if (p.bling_id) continue;
        const gemeo = vinculadoPorSku.get(norm(p.codigo_sku)) || vinculadoPorNome.get(normNome(p.nome));
        if (gemeo) alvos.push({ ...p, gemeo: { id: gemeo.id, codigo_sku: gemeo.codigo_sku, nome: gemeo.nome, bling_id: gemeo.bling_id } });
      }

      if (!confirmar) {
        return res.status(200).json({ ok: true, simulacao: true, encontrados: alvos.length, alvos });
      }

      /* Modelos de orcamento apontam para produto por id (orcamentos_modelo.itens).
         Apagar um produto em uso deixaria o item orfao no modelo — conferimos
         antes e recusamos, em vez de quebrar em silencio. */
      const { data: modelos } = await supabaseAdmin.from('orcamentos_modelo').select('id, nome, itens');
      const idsAlvo = new Set(alvos.map((a) => a.id));
      const emUso = [];
      for (const m of modelos || []) {
        for (const it of m.itens || []) {
          const pid = it.produto_id || it.id;
          if (idsAlvo.has(pid)) emUso.push({ modelo: m.nome, produto: pid });
        }
      }
      if (emUso.length) {
        return res.status(409).json({ ok: false, error: 'Ha duplicatas em uso em modelos de orcamento.', emUso });
      }

      let apagados = 0;
      const erros = [];
      for (const a of alvos) {
        const { error } = await supabaseAdmin.from('produtos').delete().eq('id', a.id);
        if (error) { if (erros.length < 5) erros.push(`${a.codigo_sku}: ${error.message}`); }
        else apagados++;
      }
      return res.status(200).json({ ok: true, apagados, deTotal: alvos.length, backup: alvos, ...(erros.length ? { erros } : {}) });
    }

    /* Ultimo recurso para os orfaos: casar pelo NOME do produto. O SKU local
       pode estar digitado errado — a Linha Light chegou com o hifen fora do
       lugar (EXT-LT virou EXTLT-, ABD-ADU-LT virou ABD-ADULT-), e por isso a
       busca por codigo nunca achava. Casa so quando o nome normalizado bate em
       UM unico produto do Bling; ambiguidade fica de fora, para nao vincular o
       produto errado. Corrige o SKU junto, senao o erro volta na proxima
       importacao. Simula por padrao. */
    if (mode === 'vincular-por-nome') {
      const { confirmar = false } = req.body || {};
      const { data: orfaos } = await supabaseAdmin
        .from('produtos')
        .select('id, codigo_sku, nome')
        .is('bling_id', null);
      if (!orfaos?.length) return res.status(200).json({ ok: true, orfaos: 0, pares: [] });

      const lista = await fetchProdutosLista(token, 30, false);
      const norm = (s) => String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

      const porNome = new Map();
      for (const b of lista) {
        const k = norm(b.nome);
        if (!k) continue;
        if (!porNome.has(k)) porNome.set(k, []);
        porNome.get(k).push(b);
      }

      const pares = [];
      const ambiguos = [];
      const semPar = [];
      for (const local of orfaos) {
        const cands = porNome.get(norm(local.nome)) || [];
        if (cands.length === 1) {
          pares.push({
            id: local.id,
            de: { sku: local.codigo_sku, nome: local.nome },
            para: { sku: cands[0].codigo, blingId: cands[0].id, nome: cands[0].nome },
          });
        } else if (cands.length > 1) ambiguos.push({ nome: local.nome, candidatos: cands.length });
        else semPar.push(local.codigo_sku || local.nome);
      }

      if (!confirmar) {
        return res.status(200).json({ ok: true, simulacao: true, pares, ambiguos, semPar });
      }

      let aplicados = 0;
      const erros = [];
      for (const p of pares) {
        const patch = { bling_id: p.para.blingId };
        if (p.para.sku && String(p.para.sku).trim()) patch.codigo_sku = String(p.para.sku).trim();
        const { error } = await supabaseAdmin.from('produtos').update(patch).eq('id', p.id);
        if (error) { if (erros.length < 8) erros.push(`${p.de.sku}: ${error.message}`); }
        else aplicados++;
      }
      return res.status(200).json({ ok: true, aplicados, deTotal: pares.length, pares, ambiguos, semPar, ...(erros.length ? { erros } : {}) });
    }

    if (mode === 'inspecionar-sku') {
      const { sku } = req.body || {};
      if (!sku) return res.status(400).json({ ok: false, error: 'Informe o sku.' });
      let encontrados = [];
      for (const q of [`codigos[]=${encodeURIComponent(sku)}`, `codigo=${encodeURIComponent(sku)}`, `nome=${encodeURIComponent(sku)}`]) {
        await sleep(300);
        const r = await blingGet(`/produtos?${q}&limite=10`, token);
        if (!r.ok) continue;
        const j = await r.json();
        if (j?.data?.length) { encontrados = j.data; break; }
      }
      const detalhes = [];
      for (const p of encontrados.slice(0, 3)) {
        const d = await fetchProdutoDetalhe(p.id, token);
        detalhes.push({
          id: p.id,
          listagem: { nome: p.nome, codigo: p.codigo, preco: p.preco, tipo: p.tipo, formato: p.formato },
          detalhe: d ? {
            nome: d.nome, codigo: d.codigo, formato: d.formato, tipo: d.tipo,
            preco: d.preco, precoCusto: d.precoCusto, precoVenda: d.precoVenda,
            pesoBruto: d.pesoBruto, pesoLiquido: d.pesoLiquido,
            situacao: d.situacao,
            variacoes: Array.isArray(d.variacoes)
              ? d.variacoes.map(v => ({ id: v.id, nome: v.nome, codigo: v.codigo, preco: v.preco, pesoBruto: v.pesoBruto }))
              : d.variacao || null,
            estrutura: d.estrutura ? 'tem estrutura' : null,
            camposDetalhe: Object.keys(d),
          } : null,
        });
      }
      return res.status(200).json({ ok: true, sku, encontrados: encontrados.length, detalhes });
    }

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

    // Diagnóstico: quais filtros de busca por documento a API v3 realmente respeita?
    // (descoberto que ?cpf_cnpj= é ignorado — devolve a primeira página inteira)
    if (mode === 'testar-filtros-contato') {
      const doc = String(req.body?.cpfCnpj || '00000000000').replace(/\D/g, '');
      const testes = [`numeroDocumento=${doc}`, `pesquisa=${doc}`, `cpf_cnpj=${doc}`, `criterio=1&pesquisa=${doc}`];
      const out = [];
      for (const q of testes) {
        await sleep(350);
        const r = await blingGet(`/contatos?${q}&limite=100`, token);
        let total = null, primeiro = null;
        if (r.ok) {
          const j = await r.json();
          total = (j?.data || []).length;
          primeiro = j?.data?.[0] ? { nome: j.data[0].nome, doc: j.data[0].numeroDocumento } : null;
        }
        out.push({ filtro: q, status: r.status, totalRetornado: total, primeiro });
      }
      return res.status(200).json({ ok: true, doc, resultados: out,
        dica: 'totalRetornado 0 com documento falso = filtro respeitado; 100 = filtro ignorado' });
    }

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
