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
    .select('id, codigo_sku, nome, preco, peso_kg, url_imagem')
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
  const fretePorPeso = pesoTotal * (regra.multiplicador || 0);
  return Math.max(fretePorPeso, regra.valor_minimo || 0);
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
