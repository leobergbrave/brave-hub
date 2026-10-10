/* Montador de orçamento de musculação — endpoints.
 *
 *  POST /api/bling?acao=montar_musculacao
 *       body { texto, linhas?: 'todas' }   → comparativo por linha + texto pronto
 *  GET|POST /api/bling?acao=estoque_musculacao_atualizar[&forcar=1]
 *       relê o saldo das máquinas no Bling e grava o cache (o robô chama de hora em hora)
 *
 * O Bling limita a 3 requisições/s e são ~280 máquinas: o saldo NÃO é consultado
 * na hora do pedido. Fica num arquivo de estado do bucket privado (mesmo padrão
 * dos outros estado/*.json) e o montador lê de lá. Estoque zerado = sob encomenda
 * (120 dias), então um saldo defasado em horas é aceitável; o texto diz a hora.
 *
 * Somente leitura no Bling: nada é gravado nem apagado lá. */
import { createClient } from '@supabase/supabase-js';
import { getValidToken } from './_bling-importar.js';
import {
  classificarProduto, interpretarLista, montarOpcoes, escolherLinhas, mensagemComparativa, mensagemLinha,
} from './_musculacao-montador.js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const BUCKET = 'propostas-pdf';
const ESTADO = 'estado/estoque-musculacao.json';
const FRESCO_MS = 10 * 60 * 1000;        // atualizar de novo antes disso é desperdício
const VELHO_MS = 3 * 3600 * 1000;        // acima disso o montador tenta atualizar na hora
const LOTE_SALDOS = 50;                  // ids por chamada em /estoques/saldos
const MAX_DETALHES = 40;                 // plano B: consultas individuais por execução
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const brt = (iso) => {
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

async function lerCache() {
  try {
    const dl = await supabaseAdmin.storage.from(BUCKET).download(ESTADO);
    if (!dl.error) return JSON.parse(await dl.data.text());
  } catch (_) { /* nunca atualizado */ }
  return null;
}
const gravarCache = (c) => supabaseAdmin.storage.from(BUCKET)
  .upload(ESTADO, Buffer.from(JSON.stringify(c)), { upsert: true, contentType: 'application/json' });

async function carregarMaquinas() {
  const { data, error } = await supabaseAdmin.from('produtos')
    .select('codigo_sku, nome, preco, url_imagem, bling_id')
    .limit(3000);
  if (error) throw new Error(`catálogo: ${error.message}`);
  return (data || []).filter((p) => classificarProduto(p));
}

const saldoDe = (s) => {
  const v = s?.saldoVirtualTotal ?? s?.saldoFisicoTotal;
  return v === null || v === undefined ? null : Number(v);
};

/* Plano A: /estoques/saldos com vários ids por chamada (~6 chamadas para tudo).
   Plano B (se o plano A falhar): detalhe produto a produto, MAX_DETALHES por
   execução, completando o cache aos poucos. */
async function buscarSaldos(token, itens, saldosAtuais) {
  const saldos = { ...saldosAtuais };
  const porId = new Map(itens.map((p) => [String(p.bling_id), p.codigo_sku]));
  let origem = 'saldos';
  let erros = 0;

  for (let i = 0; i < itens.length; i += LOTE_SALDOS) {
    const lote = itens.slice(i, i + LOTE_SALDOS);
    const qs = lote.map((p) => `idsProdutos%5B%5D=${encodeURIComponent(p.bling_id)}`).join('&');
    await sleep(400);
    let ok = false;
    try {
      const r = await fetch(`https://api.bling.com.br/v3/estoques/saldos?${qs}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: '1.0' },
      });
      if (r.ok) {
        const j = await r.json();
        for (const s of j.data || []) {
          const sku = porId.get(String(s.produto?.id));
          const v = saldoDe(s);
          if (sku && v !== null) saldos[sku] = v;
        }
        ok = true;
      }
    } catch (_) { /* cai no plano B */ }
    if (!ok) { erros += 1; origem = 'detalhe'; }
  }

  if (origem === 'detalhe') {
    // Plano B: quem ainda não tem saldo vem primeiro.
    const pendentes = itens.filter((p) => saldos[p.codigo_sku] === undefined).slice(0, MAX_DETALHES);
    for (const p of pendentes) {
      await sleep(350);
      try {
        const r = await fetch(`https://api.bling.com.br/v3/produtos/${p.bling_id}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: '1.0' },
        });
        if (!r.ok) { erros += 1; continue; }
        const v = saldoDe((await r.json()).data?.estoque);
        if (v !== null) saldos[p.codigo_sku] = v;
      } catch (_) { erros += 1; }
    }
  }
  return { saldos, origem, erros };
}

export async function atualizarEstoque({ forcar = false } = {}) {
  const atual = await lerCache();
  if (!forcar && atual?.atualizado_em && Date.now() - new Date(atual.atualizado_em).getTime() < FRESCO_MS) {
    return { ok: true, pulado: true, atualizado_em: atual.atualizado_em, total: Object.keys(atual.saldos || {}).length };
  }
  const maquinas = await carregarMaquinas();
  const semBling = maquinas.filter((p) => !p.bling_id).map((p) => p.codigo_sku);
  const comBling = maquinas.filter((p) => p.bling_id);
  const token = await getValidToken(true);
  if (!token) return { ok: false, error: 'Sem token do Bling (reautorizar em acao=bling_reauth).' };

  const { saldos, origem, erros } = await buscarSaldos(token, comBling, atual?.saldos || {});
  // Só o que ainda é máquina do catálogo: SKU que saiu do catálogo não fica no cache.
  const validos = new Set(comBling.map((p) => p.codigo_sku));
  for (const sku of Object.keys(saldos)) if (!validos.has(sku)) delete saldos[sku];

  const cache = { atualizado_em: new Date().toISOString(), origem, erros, sem_bling_id: semBling, saldos };
  const up = await gravarCache(cache);
  if (up.error) return { ok: false, error: `cache: ${up.error.message}` };
  return {
    ok: true, origem, erros, atualizado_em: cache.atualizado_em,
    maquinas: maquinas.length, com_saldo: Object.keys(saldos).length, sem_bling_id: semBling.length,
    com_estoque: Object.values(saldos).filter((v) => v > 0).length,
  };
}

export async function atualizarEstoqueMusculacao(req, res) {
  try {
    const forcar = String(req.query?.forcar || req.body?.forcar || '') === '1';
    const r = await atualizarEstoque({ forcar });
    return res.status(r.ok ? 200 : 502).json(r);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

export async function montarMusculacao(req, res) {
  try {
    const texto = String(req.body?.texto ?? req.query?.texto ?? '').slice(0, 4000);
    if (!texto.trim()) return res.status(400).json({ ok: false, error: 'Cole a lista de máquinas do lead em "texto".' });
    const todas = String(req.body?.linhas ?? req.query?.linhas ?? '') === 'todas';

    const [maquinas, cacheInicial] = await Promise.all([carregarMaquinas(), lerCache()]);
    let cache = cacheInicial;
    const idade = cache?.atualizado_em ? Date.now() - new Date(cache.atualizado_em).getTime() : Infinity;
    if (idade > VELHO_MS) {
      // Cache vazio ou velho: tenta atualizar agora, mas sem travar o pedido se o Bling não responder.
      try {
        const r = await Promise.race([atualizarEstoque({ forcar: false }), sleep(25000).then(() => null)]);
        if (r?.ok) cache = await lerCache();
      } catch (_) { /* segue com o que tem */ }
    }

    const { itens, desconhecidos } = interpretarLista(texto);
    if (!itens.length) {
      return res.status(200).json({
        ok: true, itens: [], desconhecidos, linhas: [], complementos: [],
        mensagem: 'Não consegui identificar máquinas nessa lista — me manda os modelos que você precisa?',
      });
    }
    const matriz = montarOpcoes(itens, maquinas, cache?.saldos || {});
    const escolha = escolherLinhas(matriz, itens, { texto, todas });
    const estoqueEm = cache?.atualizado_em ? brt(cache.atualizado_em) : null;
    const mensagem = mensagemComparativa(escolha.linhas, {
      desconhecidos, complementos: escolha.complementos, estoqueEm,
    });
    return res.status(200).json({
      ok: true,
      itens: itens.map((i) => ({ equip: i.equip, rotulo: i.rotulo, qtd: i.qtd, original: i.original })),
      desconhecidos,
      linhas: escolha.linhas.map((L) => ({ ...L, mensagem: mensagemLinha(L, { estoqueEm }) })),
      complementos: escolha.complementos,
      nao_encontrados: escolha.naoEncontrados,
      mensagem,
      estoque_atualizado_em: cache?.atualizado_em || null,
      estoque_ok: !!cache,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
