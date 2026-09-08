/* src/lib/pacotes.js — os três pacotes de um orçamento (Essencial, Recomendado,
   Completo).

   Por que existe: a análise de 08/09/2026 mostrou que a conversão do Léo cai de
   ~20% para 9,8% acima de R$ 20 mil, e para 8,4% nos orçamentos de 10+ itens —
   exatamente onde estão 72% do faturamento. A força do HUB (montar um orçamento
   completo de 30 itens em segundos) chega ao cliente como uma LISTA DE DECISÕES.
   O Gartner mede que comprador sobrecarregado fica 153% mais propenso a escolher
   a opção menor ou nenhuma; o JOLT Effect mostra que 40-60% dos negócios B2B
   morrem em "sem decisão", 56% por indecisão do comprador. O antídoto medido não
   é mais pressão: é menos opções e uma recomendação explícita.

   Como funciona: cada item carrega um `nivel` (1, 2 ou 3) e os pacotes são
   CUMULATIVOS — nível 1 aparece nos três, nível 2 no Recomendado e no Completo,
   nível 3 só no Completo. Uma lista de itens, uma etiqueta por item, três
   orçamentos. Item sem `nivel` vale 1, então os 864 orçamentos já salvos
   continuam renderizando exatamente como antes. */

export const NIVEIS = [
  { n: 1, chave: 'essencial', nome: 'Essencial', legenda: 'O que faz a operação acontecer' },
  { n: 2, chave: 'recomendado', nome: 'Recomendado', legenda: 'Nossa indicação para o seu caso' },
  { n: 3, chave: 'completo', nome: 'Completo', legenda: 'A estrutura inteira' },
];

export const NIVEL_PADRAO = 2;   // o Recomendado abre selecionado — a recomendação explícita

/* jsonb não valida nada: `nivel` pode chegar como string, null, 7 ou ausente.
   Normalizar na LEITURA (e não confiar na escrita) é o que mantém os orçamentos
   antigos e os novos no mesmo comportamento. */
export function nivelDoItem(item) {
  const n = Number(item?.nivel);
  return n === 2 || n === 3 ? n : 1;
}

export function itensDoNivel(itens, nivel) {
  return (itens || []).filter((i) => nivelDoItem(i) <= nivel);
}

/* Um orçamento só tem pacotes de verdade quando algum item foi marcado acima do
   nível 1. Sem isso a página do cliente mostra a lista única de sempre — não
   adianta oferecer três caminhos que levam ao mesmo lugar. */
export function temPacotes(itens) {
  return (itens || []).some((i) => nivelDoItem(i) > 1);
}

/* Natureza do item, lida do nome. Não existe campo para isso no catálogo
   (`produtos` só tem categoria GYM/CROSS), e criar um exigiria classificar 955
   produtos à mão. O nome basta para a SUGESTÃO — o Léo ajusta o que discordar
   com um clique, que é o combinado do modo híbrido. */
const NUCLEO = /remo|rower|esteira|ski|bike|storm|escada|erg\b|ergom|turf|grama|piso|rack|rig/i;
const FORCA = /anilha|barra|halter|kettle|wall ?ball|med ?ball|medicine|sandbag|sled|banco|supino|leg |smith|cross ?over|pulley|gaiola/i;

const naturezaDe = (item) => {
  const nome = String(item?.nome || '');
  if (NUCLEO.test(nome)) return 0;
  if (FORCA.test(nome)) return 1;
  return 2;
};

const valorDe = (i) => (Number(i?.preco) || 0) * (Number(i?.quantidade) || 1);

/* Metas de participação no valor de cada degrau. Sem elas o "Essencial" sairia
   custando quase o mesmo que o "Completo" — e um degrau que não é mais barato
   não dá ao cliente a saída menor que o faz dizer sim a alguma coisa em vez de
   nada. */
const META_ESSENCIAL = 0.55;
const META_RECOMENDADO = 0.82;

/* O item que ATRAVESSA a meta entra no pacote de baixo se isso aproximar o
   pacote do alvo. Cortar sempre antes deixaria o Essencial magro demais (34%
   num orçamento de box real); cortar sempre depois o deixaria inchado. */
const cabeNoDegrau = (antes, depois, alvo) =>
  Math.abs(depois - alvo) <= Math.abs(antes - alvo);

export function sugerirNiveis(itens) {
  const lista = itens || [];
  const total = lista.reduce((s, i) => s + valorDe(i), 0);
  // Poucos itens ou orçamento sem valor: dividir em três é teatro, não oferta.
  if (lista.length < 3 || total <= 0) return lista.map((i) => ({ ...i, nivel: 1 }));

  const ordem = lista
    .map((item, idx) => ({ item, idx, natureza: naturezaDe(item), valor: valorDe(item) }))
    .sort((a, b) => a.natureza - b.natureza || b.valor - a.valor || a.idx - b.idx);

  const porIndice = new Map();
  let acumulado = 0;
  let degrau = 1;

  ordem.forEach((linha, posicao) => {
    const antes = acumulado / total;
    const depois = (acumulado + linha.valor) / total;

    // Fecha o degrau atual quando este item já não o aproxima da meta.
    while (degrau === 1 && !cabeNoDegrau(antes, depois, META_ESSENCIAL)) degrau = 2;
    while (degrau === 2 && !cabeNoDegrau(antes, depois, META_RECOMENDADO)) degrau = 3;

    let nivel = degrau;
    if (linha.natureza === 0) nivel = Math.min(nivel, 2);  // núcleo nunca fica só no Completo
    if (posicao === 0) nivel = 1;                          // o Essencial nunca sai vazio

    porIndice.set(linha.idx, nivel);
    acumulado += linha.valor;
  });

  const comNivel = lista.map((item, idx) => ({ ...item, nivel: porIndice.get(idx) ?? 1 }));

  /* Guarda de honestidade: se dois degraus tiverem exatamente os mesmos itens,
     a escada tem um degrau morto — três cartões, dois idênticos. Isso é pior do
     que não oferecer pacote nenhum, porque o cliente lê como pegadinha. Nesse
     caso devolvemos a lista única de sempre. */
  const tamanhos = [1, 2, 3].map((n) => itensDoNivel(comNivel, n).length);
  if (tamanhos[0] === tamanhos[1] || tamanhos[1] === tamanhos[2]) {
    return lista.map((i) => ({ ...i, nivel: 1 }));
  }
  return comNivel;
}
