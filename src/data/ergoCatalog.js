// Catálogo dos 6 ergômetros (fonte única de verdade).
// Usado pela: página de combo (api/_render-combo.js), imagem OG dinâmica
// (api/_og-combo.js) e pelo gerador de combos no admin (ComboErgoTab.jsx).
// Preços à vista/prazo do Catálogo Brave 2026. Escada = sob consulta.
// parcela = preco (prazo) / 10 (10x sem juros).

export const ERGO_CATALOG = [
  {
    alias: 'esteira', nome: 'Esteira Curva Pro', emoji: '🏃',
    subtitle: 'Leve mais potência e precisão para seus alunos.',
    preco: 17990, preco_avista: 15990, peso_kg: 130,
    specs: [
      'Sem manivela de ajuste — corrida fluida',
      'Tração sem motor, dispensa energia elétrica',
      'Peso de trabalho definido para treinos consistentes',
      'Painel novo com maior precisão',
      'Projeto internacional com tecnologia de ponta',
      'Garantia de 1 ano',
    ],
  },
  {
    alias: 'escada', nome: 'Escada Ergométrica Brave', emoji: '🪜',
    subtitle: 'Lançamento exclusivo, equipamento silencioso.',
    preco: 0, preco_avista: 0, peso_kg: 100,
    specs: [
      'Lançamento exclusivo promocional',
      'Painel multifuncional resistente',
      'Equipamento silencioso',
      'Pronta entrega',
      'Garantia que funciona — Padrão Brave',
      'Frete grátis para algumas regiões',
    ],
  },
  {
    alias: 'remo', nome: 'Remo Indoor Brave', emoji: '🚣',
    subtitle: 'O equipamento que vai transformar suas aulas de endurance.',
    preco: 7499, preco_avista: 6499, peso_kg: 35,
    specs: [
      'Remo seco com sistema de corrente',
      'Projeto desenvolvido para o Cross Training',
      'Monitor com métricas similares ao padrão Games',
      'Monotrilho em aço inoxidável',
      'Manopla ergonômica · aparelho silencioso',
      'Garantia de 1 ano',
    ],
  },
  {
    alias: 'skierg', nome: 'Air Ski Indoor', emoji: '⛷️',
    subtitle: 'O simulador de esqui mais resistente e inovador do mercado.',
    preco: 8299, preco_avista: 7299, peso_kg: 40,
    specs: [
      'Simulador de esqui com sistema de correia',
      'Projeto desenvolvido para o Cross Training',
      'Monitor com métricas similares ao padrão Games',
      'Manoplas duplas aderentes e ergonômicas',
      'Base com tratamento antiderrapante · acompanha plataforma',
      'Garantia de 1 ano',
    ],
  },
  {
    alias: 'bikeerg', nome: 'Bike Erg Brave', emoji: '🚴',
    subtitle: 'Performance e endurance no padrão Concept.',
    preco: 7899, preco_avista: 6899, peso_kg: 30,
    specs: [
      'Controle de tensão avançado',
      'Design ergonômico',
      'Monitoramento de performance em tempo real',
      'Painel multifuncional',
      'Tendência mundial em alta performance',
      'Garantia de 1 ano',
    ],
  },
  {
    alias: 'storm', nome: 'Storm Bike Brave', emoji: '🌀',
    subtitle: 'Tecnologia americana para o seu treino.',
    preco: 9290, preco_avista: 8200, peso_kg: 55,
    specs: [
      'Sistema de correia resistida',
      'Painel de tecnologia americana',
      'Potência para suportar treinos intensos',
      'Nova plataforma — sem pisos arranhados',
      'Maior durabilidade do mercado',
      'Garantia de 1 ano',
    ],
  },
];

export const ERGO_BY_ALIAS = Object.fromEntries(ERGO_CATALOG.map(p => [p.alias, p]));

// ordem canônica dos aliases (para gerar slugs estáveis)
export const ERGO_ORDER = ERGO_CATALOG.map(p => p.alias);

// merge dos detalhes salvos no banco por cima do catálogo base (aliases fixos).
// Mantém ordem/aliases; sobrescreve nome/subtitle/specs/preços/fotos/vídeo.
export function mergeCatalog(overrides) {
  const byAlias = Object.fromEntries((overrides || []).map(p => [p.alias, p]));
  return ERGO_CATALOG.map(base => {
    const o = byAlias[base.alias] || {};
    return {
      ...base, ...o,
      specs: Array.isArray(o.specs) && o.specs.length ? o.specs : base.specs,
      fotos: Array.isArray(o.fotos) ? o.fotos.filter(Boolean) : [],
      video: o.video || '',
    };
  });
}

// "remo-skierg-storm" (qualquer ordem) -> lista de produtos na ordem canônica
export function parseComboSlug(slug, catalog = ERGO_CATALOG) {
  const pedidos = new Set(String(slug || '').toLowerCase().split('-').filter(Boolean));
  return catalog.filter(p => pedidos.has(p.alias));
}

// lista de produtos -> slug canônico "esteira-remo-storm"
export function comboSlug(produtos) {
  const set = new Set(produtos.map(p => p.alias));
  return ERGO_ORDER.filter(a => set.has(a)).join('-');
}

// totais do combo (desconto = R$ off no à vista)
export function comboTotais(produtos, desconto = 0) {
  const comPreco = produtos.filter(p => p.preco_avista > 0);
  const somaAvista = comPreco.reduce((s, p) => s + p.preco_avista, 0);
  const somaPrazo  = comPreco.reduce((s, p) => s + p.preco, 0);
  const d = Math.max(0, Number(desconto) || 0);
  const avistaFinal = Math.max(0, somaAvista - d);
  return {
    somaAvista, somaPrazo,
    desconto: d,
    avistaFinal,
    parcela: somaPrazo / 10,
    economia: (somaPrazo - somaAvista) + d,
    temConsultar: produtos.some(p => p.preco_avista <= 0),
  };
}
