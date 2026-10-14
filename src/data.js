import { supabase } from './lib/supabase';

// ─── Helpers de formatação ───
export function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatWeight(kg) {
  return `${kg.toLocaleString('pt-BR')} kg`;
}

// ─── Buscar Produtos do Supabase ───
export async function fetchProdutos() {
  const { data, error } = await supabase
    .from('produtos')
    .select('id, codigo_sku, nome, preco, preco_avista, preco_prazo, peso_kg, url_imagem')
    .order('nome');

  if (error) throw error;
  return data || [];
}

// ─── Buscar Regras de Frete do Supabase ───
export async function fetchRegrasFrete() {
  const { data, error } = await supabase
    .from('regras_frete')
    .select('estado, zona, multiplicador, valor_minimo')
    .order('estado, zona');

  if (error) throw error;
  return data || [];
}

// ─── Buscar regra de frete específica (estado + zona) ───
export async function fetchRegraFrete(estado, zona) {
  const { data, error } = await supabase
    .from('regras_frete')
    .select('multiplicador, valor_minimo')
    .eq('estado', estado)
    .eq('zona', zona)
    .single();

  if (error) return { multiplicador: 0, valor_minimo: 0 };
  return data;
}

// ─── Calcular frete com dados do Supabase ───
export function calcularFreteComRegra(pesoTotal, regra) {
  if (!regra) return 0;
  const pesoArredondado = Math.floor(pesoTotal);
  const fretePorPeso = pesoArredondado * (regra.multiplicador || 0);
  return Math.max(fretePorPeso, regra.valor_minimo || 0);
}

// ─── Frete fixo do Turf (teto da faixa por região) — vigente 13/10/2026 ───
// O Turf tem peso/volumetria alta e frete próprio: quando a proposta tem Turf,
// o frete é um valor fixo por região e IGNORA o cálculo por kg.
// Chaveado pela UF crua (GO, DF, PB…); normaliza as chaves de exibição
// (ex.: "GO/DF" → "GO", "PB (João Pessoa)" → "PB") com slice(0,2).
const TURF_FRETE_REGIAO = {
  SP: 300,
  RJ: 350, MG: 350, ES: 350, GO: 350, DF: 350,
  MT: 400, MS: 400, PR: 400, RS: 400, SC: 400,
  // Norte + Nordeste
  AC: 500, AP: 500, AM: 500, PA: 500, RO: 500, RR: 500, TO: 500,
  AL: 500, BA: 500, CE: 500, MA: 500, PB: 500, PE: 500, PI: 500, RN: 500, SE: 500,
};
const RE_TURF_SKU = /turf|grama/i;

// Detecta se a lista de itens contém Turf/Grama (produto de frete especial).
export function temTurf(itens) {
  return (itens || []).some(
    (i) => RE_TURF_SKU.test(i.codigo_sku || '') || /\b(turf|grama)\b/i.test(i.nome || '')
  );
}

// Frete fixo do Turf para o estado (ou null se o estado não estiver mapeado).
export function freteTurf(estado) {
  const uf = String(estado || '').slice(0, 2).toUpperCase();
  return TURF_FRETE_REGIAO[uf] ?? null;
}

// ─── Extrair estados e zonas únicos de um array de regras ───
export function extrairEstadosEZonas(regras) {
  const estadosSet = new Set();
  const zonasSet = new Set();
  for (const r of regras) {
    estadosSet.add(r.estado);
    zonasSet.add(r.zona);
  }
  return {
    estados: [...estadosSet].sort(),
    zonas: [...zonasSet].sort(),
  };
}

// ─── Tratamento de URLs do Google Drive ───
export function parseMediaUrl(url) {
  if (!url) return { type: 'none', url: '' };
  
  // Google Drive folder
  const folderMatch = url.match(/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) {
    return { type: 'folder', url: `https://drive.google.com/embeddedfolderview?id=${folderMatch[1]}#grid` };
  }

  // Google Drive single file (view or open?id=)
  const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch) {
    return { type: 'image', url: `https://drive.google.com/uc?export=view&id=${fileMatch[1]}` };
  }
  
  const idMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return { type: 'image', url: `https://drive.google.com/uc?export=view&id=${idMatch[1]}` };
  }

  // Fallback to direct image
  return { type: 'image', url };
}
