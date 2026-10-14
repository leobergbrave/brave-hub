/**
 * Cálculo canônico de frete por peso.
 * Mesma lógica de src/data.js:calcularFreteComRegra — mantê-las sincronizadas.
 */
export function calcularFrete(pesoTotal, regra) {
  if (!regra) return 0;
  const pesoArredondado = Math.floor(pesoTotal);
  const fretePorPeso = pesoArredondado * (regra.multiplicador || 0);
  return Math.max(fretePorPeso, regra.valor_minimo || 0);
}

// ─── Frete fixo do Turf (teto da faixa por região) — vigente 13/10/2026 ───
// Espelho de src/data.js:temTurf/freteTurf — mantê-las sincronizadas.
// Turf tem peso/volumetria alta: quando presente, ignora o cálculo por kg.
const TURF_FRETE_REGIAO = {
  SP: 300,
  RJ: 350, MG: 350, ES: 350, GO: 350, DF: 350,
  MT: 400, MS: 400, PR: 400, RS: 400, SC: 400,
  AC: 500, AP: 500, AM: 500, PA: 500, RO: 500, RR: 500, TO: 500,
  AL: 500, BA: 500, CE: 500, MA: 500, PB: 500, PE: 500, PI: 500, RN: 500, SE: 500,
};
const RE_TURF_SKU = /turf|grama/i;

export function temTurf(itens) {
  return (itens || []).some(
    (i) => RE_TURF_SKU.test(i.codigo_sku || '') || /\b(turf|grama)\b/i.test(i.nome || '')
  );
}

export function freteTurf(estado) {
  const uf = String(estado || '').slice(0, 2).toUpperCase();
  return TURF_FRETE_REGIAO[uf] ?? null;
}
