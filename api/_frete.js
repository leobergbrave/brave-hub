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
