import { createClient } from '@supabase/supabase-js';
import { log } from './_log.js';

/**
 * POST /api/importar-produtos-bling
 *
 * Modos:
 *   mode: 'inspecionar' — retorna JSON cru de 3 produtos para diagnóstico
 *   mode: 'preview'     — retorna contagem: total no Bling, novos, existentes
 *   mode: 'import'      — upsert de produtos por codigo_sku (cria + atualiza)
 *   mode: 'limpar'      — deleta produtos com origem 'bling'
 */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Token Bling ───────────────────────────────────────────────────────────────

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
  const testRes = await fetch('https://api.bling.com.br/v3/produtos?limite=1&pagina=1', {
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

// ── Buscar lista de produtos (paginada) ───────────────────────────────────────

async function fetchProdutosLista(token, maxPaginas = 20, apenasAtivos = true) {
  const produtos = [];
  let pagina = 1;
  while (pagina <= maxPaginas) {
    await sleep(350);
    // situacao A = ativo, B = inativo — busca ativos por padrão
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

// ── Buscar detalhe completo de um produto ────────────────────────────────────

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

// ── Extrair melhor URL de imagem ──────────────────────────────────────────────

function extrairImagemUrl(produto) {
  // Tenta obter a primeira imagem da lista de imagens (mais confiável)
  if (Array.isArray(produto.imagens) && produto.imagens.length > 0) {
    const principal = produto.imagens.find(i => i.principal) || produto.imagens[0];
    if (principal?.link) return principal.link;
    if (principal?.url) return principal.url;
  }
  // Fallback para o campo imagemURL da listagem
  if (produto.imagemURL) return produto.imagemURL;
  if (produto.imagem) return produto.imagem;
  return null;
}

// ── Mapear categoria do Bling para categorias existentes no Supabase ─────────
// Recebe cache pré-carregado para evitar N queries no banco durante o loop.

function mapearCategoria(nomeCategoriaBlng, catsCache, subsCache) {
  if (!nomeCategoriaBlng) return { categoria: null, subcategoria: null };

  const nomeNorm = nomeCategoriaBlng.trim().toLowerCase();

  const catMatch = catsCache.find(c => c.nome.toLowerCase() === nomeNorm);
  if (catMatch) return { categoria: catMatch.nome, subcategoria: null };

  const subMatch = subsCache.find(s => s.nome.toLowerCase() === nomeNorm);
  if (subMatch) return { categoria: null, subcategoria: subMatch.nome };

  return { categoria: null, subcategoria: null };
}

// ── Upsert produto no Supabase ────────────────────────────────────────────────

async function upsertProduto(dados) {
  try {
    const agora = new Date().toISOString();

    // Verificar se já existe por codigo_sku — busca também url_imagem para preservar
    let existente = null;
    if (dados.codigo_sku) {
      const { data } = await supabaseAdmin
        .from('produtos')
        .select('id, url_imagem')
        .eq('codigo_sku', dados.codigo_sku)
        .maybeSingle();
      existente = data;
    }

    // Preserva a imagem existente se o Bling não devolveu uma nova
    const urlImagemFinal = dados.url_imagem || existente?.url_imagem || null;

    // Payload base (campos que existem com certeza)
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

    // Tentar com campos extras (origem, bling_id) — ignorar erro se não existirem
    const payloadFull = { ...payloadBase, origem: 'bling', bling_id: dados.bling_id || null };

    if (existente) {
      // Tenta com payload completo, se falhar usa base
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

// ── Handler principal ─────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { mode = 'preview', apenasAtivos = true } = req.body || {};

  // ── MODO: LIMPAR ────────────────────────────────────────────────────────────
  if (mode === 'limpar') {
    const { error, count } = await supabaseAdmin
      .from('produtos')
      .delete({ count: 'exact' })
      .eq('origem', 'bling');
    if (error) return res.status(500).json({ ok: false, error: error.message });
    return res.status(200).json({ ok: true, deletados: count || 0 });
  }

  // Token Bling
  const token = await getValidToken();
  if (!token) return res.status(500).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });

  // ── MODO: INSPECIONAR ───────────────────────────────────────────────────────
  if (mode === 'inspecionar') {
    const lista = await fetchProdutosLista(token, 1, false);
    const amostra = lista.slice(0, 3);
    // Buscar detalhe do primeiro
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

  // ── MODO: PREVIEW ───────────────────────────────────────────────────────────
  if (mode === 'preview') {
    const produtos = await fetchProdutosLista(token, 20, apenasAtivos);
    const codigos = produtos.map(p => p.codigo).filter(Boolean);

    // Verificar quais já existem por codigo_sku
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

  // ── MODO: IMPORT ─────────────────────────────────────────────────────────────
  if (mode === 'import') {
    const lista = await fetchProdutosLista(token, 20, apenasAtivos);
    const produtosComCodigo = lista.filter(p => p.codigo); // só com SKU (dedup key)

    // Carregar categorias e subcategorias uma única vez antes do loop
    const { data: catsCache = [] } = await supabaseAdmin.from('categorias').select('nome');
    const { data: subsCache = [] } = await supabaseAdmin.from('subcategorias').select('nome');
    log('importar-produtos', 'info', 'Cache de categorias carregado', { cats: catsCache.length, subs: subsCache.length });

    let criados = 0, atualizados = 0, erros = 0, semFoto = 0;

    for (const item of produtosComCodigo) {
      // Buscar detalhe completo (inclui imagens, preços, peso, categoria)
      const detalhe = await fetchProdutoDetalhe(item.id, token);
      const produto = detalhe || item;

      // Imagem
      const urlImagem = extrairImagemUrl(produto);
      if (!urlImagem) semFoto++;

      // Categoria (usa cache — sem query por produto)
      const nomeCat = produto.categoria?.descricao || produto.categoria?.nome || null;
      const { categoria, subcategoria } = mapearCategoria(nomeCat, catsCache ?? [], subsCache ?? []);

      // Preços
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

  return res.status(400).json({ ok: false, error: 'Modo inválido. Use: preview | import | inspecionar | limpar' });
}
