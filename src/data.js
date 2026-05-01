// ─── Produtos (Mock) ───
export const PRODUTOS = [
  { id: 1, nome: "Med Ball 09 kg Fitness Race", preco: 340.00, peso: 9 },
  { id: 2, nome: "TURF Base Brave 16mm", preco: 1890.00, peso: 20 },
  { id: 3, nome: "Elite Rig Brave - 80x80", preco: 43000.00, peso: 450 },
  { id: 4, nome: "Anilha Black Bumper 2.0-20kg", preco: 580.00, peso: 20 },
  { id: 5, nome: "BikeErg Concept 2", preco: 18900.00, peso: 30 },
];

// ─── Tabela de Frete ───
export const FRETE = {
  SP: { min: 100, zonas: { 'CAPITAL': 1.2, 'INTERIOR 1': 1.4, 'INTERIOR 2': 1.6 } },
  MG: { min: 150, zonas: { 'CAPITAL': 1.4, 'INTERIOR 1': 1.6, 'INTERIOR 2': 1.8 } },
  BA: { min: 280, zonas: { 'CAPITAL': 3.0, 'INTERIOR 1': 3.0, 'INTERIOR 2': 4.0 } },
};

export const ESTADOS = Object.keys(FRETE);
export const ZONAS = ['CAPITAL', 'INTERIOR 1', 'INTERIOR 2'];

// ─── Helpers ───
export function formatCurrency(value) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatWeight(kg) {
  return `${kg.toLocaleString('pt-BR')} kg`;
}

export function calcularFrete(pesoTotal, estado, zona) {
  if (!estado || !zona) return 0;
  const config = FRETE[estado];
  if (!config) return 0;
  const fator = config.zonas[zona] ?? 0;
  const fretePorPeso = pesoTotal * fator;
  return Math.max(fretePorPeso, config.min);
}
