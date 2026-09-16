// api/_fss-produtos.js — mensagens prontas de produtos para o painel do FSS.
// Monta texto WhatsApp + video de cada produto a partir do catalogo do banco
// (loadCatalog: 6 ergometros + curados de combo_produtos). Os textos ficam aqui,
// e nao no userscript, para que preco/caracteristicas editados no admin valham
// na hora, sem reinstalar o script no Tampermonkey.

import { createClient } from '@supabase/supabase-js';
import { loadCatalog } from './_ergo-fetch.js';
import { bcFetch, telefoneWhatsappBR } from './_proposta-pdf.js';

/* Mensagens de inicio de conversa — mesma fonte para o userscript do PC e a
   central mobile (/enviar). */
export const RAPIDAS = [
  {
    id: 'abertura', titulo: '👋 Abertura',
    texto: 'Oi, tudo bem? Aqui é o Léo Berg 👊 Você já conhece a BRAVE?',
  },
  {
    /* Apresentacao institucional: usada com lead frio, que ainda nao sabe quem
       e a BRAVE. Os numeros vem do perfil oficial (@bravefitnessbr) e das
       credenciais do site — nada aqui pode ser estimativa. */
    id: 'apresentacao', titulo: '🦁 Apresentar a BRAVE',
    texto: [
      '🦁 *BRAVE — Equipamentos Fitness*',
      'O parceiro do empresário fitness desde 2020.',
      '',
      '🏆 *Patrocinadora oficial dos maiores campeonatos do país:*',
      '• Copa SUR de CrossFit — 3 edições seguidas',
      '• TCB — The CrossFit Games Brasil',
      '• Powered by Coffee',
      '• UAIROX — Hybrid RUN',
      '• HTC — Fitness RUN',
      '',
      'Equipamento que aguenta a pressão do pódio aguenta a rotina do seu box — é o mesmo padrão que entregamos pra você.',
      '',
      '🇧🇷 +3.000 negócios fitness equipados no Brasil',
      '📸 https://instagram.com/bravefitnessbr — 56 mil pessoas acompanham nossas entregas',
    ].join('\n'),
  },
  {
    id: 'cadastro', titulo: '📋 Pedir cadastro',
    texto: 'Para realizar seu orçamento personalizado, por favor preencha esse cadastro\nhttps://brave-hub-two.vercel.app/cadastro\nMe avise quando finalizar',
  },
];

const fmtBR = (v) => {
  const n = Number(v) || 0;
  const centavos = Math.round(n * 100) % 100 !== 0;
  return 'R$ ' + n.toLocaleString('pt-BR', {
    minimumFractionDigits: centavos ? 2 : 0, maximumFractionDigits: 2,
  });
};

const linhaPreco = (avista, prazo) => (Number(avista) > 0
  ? `💰 *${fmtBR(avista)} à vista* ou 10x de ${fmtBR((Number(prazo) || 0) / 10)} sem juros`
  : '💰 Preço sob consulta — me chama que monto sua condição');

/* Remo e SkiErg sao estacoes oficiais das provas de corrida hibrida —
   argumento de venda mais forte que o subtitle generico do catalogo (que segue
   valendo nas LPs). Cada um com angulo diferente para nao soar repetido na
   mesma conversa. ATENCAO: "HYROX" e marca registrada de terceiro e nao pode
   aparecer em conteudo nosso — citamos as provas que a BRAVE patrocina
   (UAIROX e HTC) ou o termo generico "corrida hibrida". */
const CORRIDA_HIBRIDA = {
  remo: {
    subtitle: 'O ergômetro oficial das provas de corrida híbrida e do Cross Training — pronto para transformar suas aulas de endurance.',
    bullet: 'Estação oficial das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN) — treine seus alunos no equipamento da competição',
  },
  skierg: {
    subtitle: 'O simulador de esqui das provas de corrida híbrida — o mais resistente e inovador do mercado.',
    bullet: 'Estação oficial das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN) — a modalidade que mais cresce no mundo',
  },
};

function mensagemErgo(p) {
  const hy = CORRIDA_HIBRIDA[p.alias];
  let specs = (p.specs || []).filter(Boolean);
  if (hy) {
    // O bullet da prova substitui o de Cross Training (que ja fica implicito no subtitle)
    specs = [hy.bullet, ...specs.filter((s) => !/cross training/i.test(s))];
  }
  return [
    `${p.emoji} *${p.nome}*`,
    hy ? hy.subtitle : p.subtitle,
    '',
    ...specs.map((s) => `✅ ${s}`),
    '',
    linhaPreco(p.preco_avista, p.preco),
  ].join('\n');
}

// Familias com variacoes (metragens): uma mensagem so, apresentando o produto
// e listando as opcoes com preco ao final. Sleds sao itens separados: cada um
// tem video proprio, e video + texto devem casar (pedido do Leo em 2026-09-02).
function mensagemSledImportado(p) {
  return [
    '🛷 *Sled Importado — Medidas Oficiais de Competição 50kg*',
    'Push e Pull: as estações de força da prova, dentro do seu box.',
    '',
    '✅ Medidas oficiais — padrão UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    '✅ Serve para empurrar e puxar — 2 estações em 1',
    '✅ Tubo central em inox e grip nos tubos',
    '✅ Tubos removíveis para transporte fácil',
    '✅ Compatível com anilhas para carga extra',
    '✅ Adaptável ao Turf',
    '',
    linhaPreco(p.preco_avista, p.preco),
  ].join('\n');
}

function mensagemSledNacional(p) {
  return [
    '🛷 *Sled Nacional — Medidas Oficiais de Competição 25kg*',
    'O sled da prova em versão nacional — mesma pegada, preço mais acessível.',
    '',
    '✅ Medidas oficiais — padrão UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    '✅ Serve para empurrar e puxar — 2 estações em 1',
    '✅ Pintura eletrostática de alta resistência',
    '✅ Tubos removíveis para transporte fácil',
    '✅ Compatível com anilhas para carga extra',
    '✅ Fabricação em 20 dias',
    '',
    linhaPreco(p.preco_avista, p.preco),
  ].join('\n');
}

function mensagemTurf(cheio, lanes, base) {
  const l = [
    '🏟️ *TURF Oficial — O Piso das Provas de Corrida Híbrida*',
    'O mesmo piso que o atleta encontra na prova: seu box pronto para treinos de sled, lunges e carries.',
    '',
    '✅ O mesmo piso das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    "✅ Ideal para sled push/pull, lunges e farmer's carry",
    '✅ Transforma qualquer corredor em estação de treino',
  ];
  if (cheio) l.push('', `📏 *16,5m x 2m* — ${linhaPreco(cheio.preco_avista, cheio.preco)}`);
  if (lanes) l.push(`📏 *12,5m x 2m (lanes centrais)* — ${linhaPreco(lanes.preco_avista, lanes.preco)}`);
  if (base)  l.push(`➕ Opcional: *Base do atleta 1,8m x 2m* — ${fmtBR(base.preco_avista)} à vista`);
  return l.join('\n');
}

/* Sandbag: a estacao de lunges da prova (100m). O catalogo nao traz specs
   para esses itens, entao os argumentos vivem aqui — mesma linha editorial
   dos demais. Tres pesos numa mensagem so, como turf e grama. */
function mensagemSandbag(s10, s20, s30) {
  const l = [
    '🎒 *Sandbag Hybrid Pro Series*',
    'A estação de lunges da prova: 100 metros com a carga nas costas.',
    '',
    '✅ Estação oficial das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    '✅ Alças reforçadas para lunges, carries e cleans',
    '✅ Material resistente à abrasão e ao uso diário',
    '✅ Enchimento uniforme — carga estável durante o movimento',
    '✅ Pronta entrega',
  ];
  const linha = (p, peso) => { if (p) l.push(`*${peso}* — ${linhaPreco(p.preco_avista, p.preco)}`); };
  if (s10 || s20 || s30) l.push('');
  linha(s10, '10kg'); linha(s20, '20kg'); linha(s30, '30kg');
  return l.join('\n');
}

/* Corda do sled: duas linhas (Preta importada e Cinza Oficial) x dois
   comprimentos. As de 10 metros nao ficam em estoque — avisar do prazo aqui
   evita a pergunta depois e a frustracao de prometer entrega rapida. */
function mensagemCorda(preta10, preta15, cinza10, cinza15) {
  const l = [
    '🪢 *Sled Tech Rope 38mm*',
    'A corda que puxa o sled sem serrar na mão nem desfiar no atrito.',
    '',
    '✅ 38mm — diâmetro que dá pegada firme no pull',
    '✅ Ponteira de aço: engate rápido e resistente',
    '✅ Comprimento de prova para puxada completa',
  ];
  const opcao = (p, rotulo, encomenda) => {
    if (!p) return;
    l.push('', `${rotulo}${encomenda ? ' _(sob encomenda 60 dias)_' : ''}`, linhaPreco(p.preco_avista, p.preco));
  };
  opcao(preta10, '⚫ *Preta — 10 metros*', true);
  opcao(preta15, '⚫ *Preta — 15 metros*', false);
  opcao(cinza10, '🩶 *Cinza (Oficial) — 10 metros*', true);
  opcao(cinza15, '🩶 *Cinza (Oficial) — 15 metros*', false);
  return l.join('\n');
}

function mensagemGrama(g10, g16) {
  const l = [
    '🌱 *Grama Sintética Premium Preta — 2 Raias*',
    'Visual profissional e área funcional para o seu box em um só piso.',
    '',
    '✅ Preta com raias demarcadas — estética premium',
    '✅ 2 raias prontas para sled, lunges e sprints',
    '✅ Alta durabilidade para treino diário',
    '✅ Instalação simples, adapta a qualquer área',
  ];
  if (g10) l.push('', `📏 *2m x 10m* — ${linhaPreco(g10.preco_avista, g10.preco)}`);
  if (g16) l.push(`📏 *2m x 16m* — ${linhaPreco(g16.preco_avista, g16.preco)}`);
  return l.join('\n');
}

/* ── Med Balls ──────────────────────────────────────────────────────────
   Sao 39 linhas no catalogo, em familias sobrepostas — por isso a lista de
   SKUs e explicita: um filtro por nome traria as Kids, as pretas de entrada e
   ate racks junto. Ficam em `produtos` (nao em combo_produtos): sao 21 itens,
   e duplica-los na lista curada poluiria o montador de combos e criaria duas
   verdades de preco. */
/* So os pesos em LB: a linha tem KG e LB ao mesmo tempo, e misturar as duas
   unidades na mesma mensagem deixa o cliente sem base de comparacao (pedido do
   Leo em 08/09). As de KG (M2P, M4P, M6P, M9P, M12P) seguem no catalogo e no
   orcamento — so nao entram nesta mensagem. */
const MEDBALL_PRO = ['M8P', 'M10P', 'M14P', 'M16P', 'M20P', 'M30P'];

/* M25B (25LB Black) fora: custava R$ 269 a vista, abaixo da 20LB e ate da 8LB
   — na lista o preco furado salta aos olhos. Volta quando o valor no catalogo
   for corrigido. */
const MEDBALL_COR = ['M4L', 'M8C', 'M10C', 'M12C', 'M14C', 'M16C', 'M18B', 'M20C', 'M30C'];

/* Kettlebell Iron: a linha da fundicao propria, do 4 ao 32kg de 2 em 2.
   ATENCAO KB26: custa R$ 390 no catalogo, fora da regra de R$ 16/kg das
   outras catorze (seria R$ 416). Na lista isso aparece como +R$ 5 do 24 para o
   26 e +R$ 52 do 26 para o 28, contra ~R$ 29 nos demais degraus. Fica na
   mensagem porque o peso existe e vende; corrigir o preco e no catalogo. */
const KETTLEBELL_IRON = [
  'KB4', 'KB6', 'KB8', 'KB10', 'KB12', 'KB14', 'KB16', 'KB18',
  'KB20', 'KB22', 'KB24', 'KB26', 'KB28', 'KB30', 'KB32',
];

/* Oficial Texturizado — a linha texturizada que o Leo vende (escolha dele em
   15/09; a "Texturizado Importado", KT4-KT32, fica fora do painel).
   ATENCAO 'Kbo4': o 4kg esta cadastrado em MINUSCULO. A busca por SKU e exata e
   diferencia maiusculas, entao escrever 'KBO4' aqui faria o peso sumir da
   mensagem sem erro nenhum. Mantenha o valor exato do catalogo. */
const KETTLEBELL_TEXTURIZADO = [
  'Kbo4', 'KBO6', 'KBO8', 'KBO10', 'KBO12', 'KBO14', 'KBO16', 'KBO18',
  'KBO20', 'KBO24', 'KBO32',
];

/* Hibrido Vulcanizado. ATENCAO KBH8: peso_kg esta 12 no catalogo (e 8kg). Nao
   afeta esta mensagem, que le o peso do NOME, mas afeta o frete do orcamento. */
const KETTLEBELL_HIBRIDO = ['KBH8', 'KBH12', 'KBH16', 'KBH20', 'KBH24', 'KBH32'];

/* Anilhas Bumper 2.0. Fora da mensagem, de proposito:
   - "Black and White" (2BW*) e "CAMPEONATO" (*CAMP): mesmos precos das linhas
     base, sao edicoes especiais e poluiriam a lista de pesos;
   - Collor em LIBRAS (2AC10LB..2AC55LB, 6 pesos, outras cores): misturar KG e
     LB na mesma mensagem tira a base de comparacao do cliente — foi o que o
     Leo mandou corrigir nas Med Balls. A LP crossfit-box apresenta o Collor
     como "Disponivel de 5 a 25 kg", entao o painel segue em KG. */
const BUMPER_BLACK = ['2BK05', '2BK10', '2BK15', '2BK20', '2BK25'];
const BUMPER_COLLOR = ['2AC05', '2AC10', '2AC15', '2AC20', '2AC25'];

/* Foto da LINHA INTEIRA, e nao a de um peso: nas duas anilhas o que diferencia
   e justamente a variacao entre os pesos — na Black a escrita muda de cor (25
   vermelha, 20 azul, 15 amarela, 10 verde, 5 branca) e na Collor muda a anilha
   toda. Uma foto de um peso so esconde o argumento do produto.
   Fotos enviadas pelo Leo em 16/09; vieram do Google Drive e estao hospedadas
   aqui porque a BotConversa nao consegue baixar do Drive. Nao vao no catalogo:
   pertencem a linha, e url_imagem e por SKU (vale para proposta e Bling). */
const BUCKET_PUBLICO = `${process.env.VITE_SUPABASE_URL || ''}/storage/v1/object/public/produtos_media`;
const FOTO_LINHA_BLACK = `${BUCKET_PUBLICO}/linhas/linha-bumper-black-2.0.jpg`;
const FOTO_LINHA_COLLOR = `${BUCKET_PUBLICO}/linhas/linha-bumper-collor-2.0.jpg`;

async function buscarPorSku(skus) {
  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { data } = await supabase
      .from('produtos')
      .select('codigo_sku, nome, preco, url_imagem')
      .in('codigo_sku', skus);
    return data || [];
  } catch (_) {
    return [];   // sem catalogo a familia simplesmente nao aparece no menu
  }
}

/* Ordena por peso REAL: a linha mistura KG e LB, e ordenar pelo numero cru
   colocaria a de 30LB (13,6kg) antes da de 12KG. */
function pesoEmKg(nome) {
  const m = String(nome).match(/(\d+(?:[.,]\d+)?)\s*(KG|LB)/i);
  if (!m) return 999;
  const n = Number(m[1].replace(',', '.'));
  return m[2].toUpperCase() === 'LB' ? n * 0.4536 : n;
}

/* Rotulo do peso como esta no catalogo (02KG, 20LB) — e o que o cliente vera
   na proposta, entao inventar conversao aqui criaria divergencia. */
const rotuloPeso = (nome) => {
  const m = String(nome).match(/(\d+)\s*(KG|LB)/i);
  return m ? `${Number(m[1])}${m[2].toUpperCase()}` : nome;
};

/* A cor fica no fim do nome, em dois formatos que o catalogo usa:
     med ball .... "Med Ball 08LB - Verde"                  (traco, cor)
     anilha ...... "Anilha Collor Bumper 2.0 - 05kg Cinza"  (peso, cor)
   Os dois padroes nao se confundem: o da anilha exige o peso colado na cor, e
   o da med ball exige que nao haja numero depois do traco. */
const corDoItem = (nome) => {
  const t = String(nome || '');
  const aposPeso = t.match(/\d+\s*(?:kg|lb)\s+([A-Za-zÀ-ú]+)\s*$/i);
  if (aposPeso) return aposPeso[1];
  const aposTraco = t.match(/-\s*([A-Za-zÀ-ú]+)\s*$/);
  return aposTraco ? aposTraco[1] : '';
};

/* Cada peso leva os DOIS valores, como no resto do painel. Mostrar so o a
   vista e anunciar "10x" no rodape fazia o cliente dividir o numero errado: a
   parcela sai do preco A PRAZO (R$ 419 = 10x de R$ 41,90), nao do a vista
   (R$ 377). Preco do catalogo e o a prazo; a vista tem 10% de desconto. */
function linhasDePeso(bolas, comCor) {
  return bolas
    .slice()
    .sort((a, b) => pesoEmKg(a.nome) - pesoEmKg(b.nome))
    .map((b) => {
      // Reais inteiros: e como os precos a vista aparecem no catalogo
      // (R$ 449, R$ 629) — centavos quebrados denunciam conta automatica.
      const avista = Math.round(Number(b.preco) * 0.9);
      const cor = comCor ? corDoItem(b.nome) : '';
      return `*${rotuloPeso(b.nome)}*${cor ? ` ${cor}` : ''} — ${linhaPreco(avista, b.preco)}`;
    });
}

function mensagemMedBallPro(bolas) {
  return [
    '🏐 *Medicine Ball Pro Series*',
    'A bola de wall ball da linha de competição: costura reforçada e peso que não desanda no meio do WOD.',
    '',
    '✅ Costura reforçada — aguenta arremesso repetido na parede',
    '✅ Enchimento firme, sem deformar com o uso',
    '✅ Superfície com pegada mesmo com a mão suada',
    '✅ Garantia de 1 ano',
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(bolas, false),
  ].join('\n');
}

function mensagemMedBallColorida(bolas) {
  return [
    '🎨 *Med Ball Colorida — Peso por Cor*',
    'Cada peso tem sua cor: o aluno pega a bola certa de longe, sem parar o treino para conferir.',
    '',
    '✅ Cor por peso — organiza a aula e agiliza a troca',
    '✅ Costura reforçada para arremesso na parede',
    '✅ Enchimento firme, sem deformar com o uso',
    '✅ Garantia de 1 ano',
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(bolas, true),
  ].join('\n');
}

/* Os argumentos vem da propria LP crossfit-box (config curada pelo Leo):
   "Fundicao propria", "Produto ecologico", "produzido a partir de ferro de
   sucata". Nada aqui e especificacao inventada — sem fonte, sem bullet. */
function mensagemKettlebellIron(kbs) {
  return [
    '🔔 *Kettlebell Iron — Fundição Própria BRAVE*',
    'Ferro fundido direto da nossa fundição, do 4kg ao 32kg.',
    '',
    '✅ Fundição própria BRAVE',
    '✅ Produto ecológico, produzido a partir de ferro de sucata',
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(kbs, false),
  ].join('\n');
}

/* Oficial Texturizado — fonte de CADA bullet (pesquisa de 15/09/2026). Nem o
   site da BRAVE, nem o Bling, nem as LPs tem descricao deste produto; o que
   segue vem de onde da para conferir:
   - texturizado ....... o nome do produto + o acabamento fosco visivel na foto
   - KG e LB gravados .. a foto do produto (bling_kbo18: "32KG/71LB", "24KG/53LB")
   - anel colorido ..... a foto do produto
   - Corrida Fitness ... categorias da pagina do produto em bravefitness.com.br
   NAO afirmar (a foto desmente):
   - "kettlebell de competicao": os tamanhos VARIAM com o peso na foto, e
     competicao tem o mesmo tamanho em todos os pesos por definicao;
   - "uma cor por peso": na foto as cores se repetem (dois verdes, dois
     vermelhos). */
function mensagemKettlebellTexturizado(kbs) {
  return [
    '🔔 *Kettlebell Oficial Texturizado*',
    'Acabamento texturizado e peso gravado em KG e LB, do 4kg ao 32kg.',
    '',
    '✅ Acabamento texturizado para pegada firme',
    '✅ Peso gravado em KG e LB no próprio corpo',
    '✅ Anel colorido na base da alça',
    '✅ Linha BRAVE para Corrida Fitness e CrossTraining',
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(kbs, false),
  ].join('\n');
}

/* Hibrido Vulcanizado — fonte de CADA bullet (pesquisa de 15/09/2026):
   - oficial das provas .. afirmacao do Leo ("o Hybrid e o oficial, usado nas
     provas"). A peca traz gravado "HYBRID", mesmo nome da UAIROX — Hybrid RUN,
     prova que a BRAVE patrocina.
   - vulcanizado ......... propriedade do revestimento de borracha vulcanizada
     (amortece o impacto: protege o piso e reduz o barulho na queda).
   - alca cromada, peso marcado .. a foto do produto (bling_kbh8). "Marcado" e
     nao "gravado": no Hibrido o peso e letra branca sobre a borracha, e a foto
     nao permite afirmar que e gravado (no Texturizado e fundido no ferro).
   ATENCAO MARCA: o Leo disse "HYROX", mas HYROX e marca registrada de terceiro
   e nao pode aparecer em conteudo nosso (regra dele). Alem disso, o kettlebell
   oficial da HYROX e o Centr Octo, de 8 faces — e o Hibrido e arredondado. Por
   isso: UAIROX (Hybrid RUN) e HTC (Fitness RUN), como no Sled, na Sandbag e no
   Turf. NAO copiar especificacoes do Centr (uretano nao e vulcanizado). */
function mensagemKettlebellHibrido(kbs) {
  return [
    '🔔 *Kettlebell Híbrido Vulcanizado*',
    'O kettlebell oficial das provas de corrida híbrida, do 8kg ao 32kg.',
    '',
    '✅ Estação oficial das provas UAIROX (Hybrid RUN) e HTC (Fitness RUN)',
    '✅ Revestimento vulcanizado: protege o piso e reduz o barulho na queda',
    '✅ Alça cromada e peso marcado no corpo',
    "✅ Ideal para farmer's carry",
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(kbs, false),
  ].join('\n');
}

/* Anilhas — fonte de CADA bullet: a LP crossfit-box, curada pelo Leo.
   Bumper Black 2.0: tagline "Quique reduzido e design com logo em alto
   relevo", features "Dureza aferida com medidor" e "Alto nivel de
   acabamento". O centro em inox e o logo em relevo aparecem na foto do
   produto (2BK25). */
function mensagemBumperBlack(anilhas) {
  return [
    '⚫ *Anilha Black Bumper 2.0*',
    'Quique reduzido e logo em alto relevo, do 5kg ao 25kg.',
    '',
    '✅ Quique reduzido ao soltar a barra no chão',
    '✅ Dureza aferida com medidor',
    '✅ Logo BRAVE em alto relevo',
    '✅ Alto nível de acabamento',
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(anilhas, false),
  ].join('\n');
}

/* Bumper Collor 2.0: tagline "Diferencie seu box com cores vibrantes de
   impacto", features "Borracha premium · centro em inox" e "Garantia de 2 anos
   contra quebra" (LP crossfit-box). A cor por peso e verificavel no proprio
   catalogo — 5 cinza, 10 verde, 15 amarelo, 20 azul, 25 vermelha, todas
   distintas (diferente dos kettlebells, onde as cores se repetiam).
   NAO afirmar "padrao IWF": na LP essa e a linha Competition (ABC*), outro
   produto. */
function mensagemBumperCollor(anilhas) {
  return [
    '🔴 *Anilha Bumper Collor 2.0*',
    'Cada peso na sua cor, do 5kg ao 25kg.',
    '',
    '✅ Uma cor para cada peso — a barra certa montada sem conferir',
    '✅ Borracha premium com centro em inox',
    '✅ Garantia de 2 anos contra quebra',
    '',
    '*Pesos e valores:*',
    ...linhasDePeso(anilhas, true),
  ].join('\n');
}

const ERGO_ALIASES = ['esteira', 'escada', 'remo', 'skierg', 'bikeerg', 'storm'];

/* Primeira foto utilizavel entre os produtos de uma familia. So serve link que
   o WhatsApp/BotConversa consegue baixar — o Google Drive bloqueia. */
const primeiraFoto = (...produtos) => produtos
  .flatMap((p) => p?.fotos || [])
  .find((u) => u && !/drive\.google\.com/.test(u)) || '';

/* Fotos de uma linha do catálogo geral (med balls, kettlebells), a partir das
   linhas de `produtos`.

   Bug que isto corrige (15/09/2026): antes era `.filter(Boolean).slice(0, 2)`
   na ordem em que o banco devolvia — ordem não garantida. O catálogo guarda o
   marcador de TEXTO 'SEM_FOTO_BLING' no lugar da foto (KBO12, M4L), e texto
   passa num filtro Boolean. No dia em que o banco devolvesse um deles primeiro,
   o marcador iria para a BotConversa como mídia, ela recusaria e o envio
   abortaria ANTES do texto com os preços. O gerador de PDF já filtrava esse
   marcador (_render-proposta.js); o painel nunca tinha aprendido.

   Agora: só link http de verdade (nem marcador, nem vazio, nem Google Drive,
   que bloqueia o download), sempre na mesma ordem — do peso mais leve ao mais
   pesado, SKU como desempate — e sem repetir URL. Travado por
   scripts/teste-fotos-da-linha.mjs. */
const fotoUtilizavel = (u) => /^https?:\/\//i.test(u) && !/drive\.google\.com/i.test(u);

export function fotosDaLinha(linhas, quantas) {
  const vistas = new Set();
  return (linhas || [])
    .slice()
    .sort((a, b) => pesoEmKg(a.nome) - pesoEmKg(b.nome)
      || String(a.codigo_sku).localeCompare(String(b.codigo_sku)))
    .map((l) => String(l.url_imagem || '').trim())
    .filter(fotoUtilizavel)
    .filter((u) => (vistas.has(u) ? false : vistas.add(u)))
    .slice(0, quantas);
}

async function montarItens() {
  const catalogo = await loadCatalog();
  const por = Object.fromEntries(catalogo.map((p) => [p.alias, p]));
  const itens = [];

  for (const alias of ERGO_ALIASES) {
      const p = por[alias];
      if (!p) continue;
      itens.push({ id: alias, titulo: `${p.emoji} ${p.nome}`, texto: mensagemErgo(p), video: p.video || '' });
  }

  if (por.sledimp) {
      itens.push({
        id: 'sledimp', titulo: '🛷 Sled Importado 50kg',
        texto: mensagemSledImportado(por.sledimp),
        video: por.sledimp.video || '',
      });
  }
  if (por.slednac) {
      itens.push({
        id: 'slednac', titulo: '🛷 Sled Nacional 25kg',
        texto: mensagemSledNacional(por.slednac),
        video: por.slednac.video || '',
      });
  }
  if (por.turf || por.turflanes) {
      itens.push({
        id: 'turf', titulo: '🏟️ Turf Oficial de Competição',
        texto: mensagemTurf(por.turf, por.turflanes, por.turfbase),
        video: por.turflanes?.video || por.turf?.video || '',
      });
  }
  if (por.gramp10 || por.gramp16) {
      itens.push({
        id: 'grama', titulo: '🌱 Grama Premium',
        texto: mensagemGrama(por.gramp10, por.gramp16),
        video: por.gramp10?.video || por.gramp16?.video || '',
      });
  }
  if (por.c10imp || por.c15imp || por.c10cinza || por.c15cinza) {
      itens.push({
        id: 'corda', titulo: '🪢 Corda para Sled (Tech Rope)',
        texto: mensagemCorda(por.c10imp, por.c15imp, por.c10cinza, por.c15cinza),
        video: por.c15imp?.video || por.c10imp?.video || '',
        /* A mensagem vende as duas cores — mandar so uma foto deixaria o
           cliente escolhendo no escuro. Cinza (Oficial) primeiro por ser a
           premium; a preta logo depois. */
        fotos: [primeiraFoto(por.c15cinza, por.c10cinza), primeiraFoto(por.c15imp, por.c10imp)].filter(Boolean),
      });
  }
  /* Med balls vem do catalogo geral, nao do combo — busca em paralelo para
     nao somar duas idas ao banco no tempo de resposta do painel. */
  const [medPro, medCor, kbIron, kbTex, kbHib, bmpBlack, bmpCollor] = await Promise.all([
    buscarPorSku(MEDBALL_PRO), buscarPorSku(MEDBALL_COR), buscarPorSku(KETTLEBELL_IRON),
    buscarPorSku(KETTLEBELL_TEXTURIZADO), buscarPorSku(KETTLEBELL_HIBRIDO),
    buscarPorSku(BUMPER_BLACK), buscarPorSku(BUMPER_COLLOR),
  ]);
  if (medPro.length) {
      itens.push({
        id: 'medballpro', titulo: '🏐 Medicine Ball Pro Series',
        texto: mensagemMedBallPro(medPro),
        video: '',
        fotos: fotosDaLinha(medPro, 2),
      });
  }
  if (medCor.length) {
      itens.push({
        id: 'medballcor', titulo: '🎨 Med Ball Colorida',
        texto: mensagemMedBallColorida(medCor),
        video: '',
        fotos: fotosDaLinha(medCor, 2),
      });
  }
  if (kbIron.length) {
      itens.push({
        id: 'kbiron', titulo: '🔔 Kettlebell Iron',
        texto: mensagemKettlebellIron(kbIron),
        video: '',
        // Uma foto so (pedido do Leo, 15/09): os 15 pesos usam a mesma imagem.
        fotos: fotosDaLinha(kbIron, 1),
      });
  }
  /* Ordem Iron -> Texturizado -> Hibrido segue o preco por quilo (R$ 16, 28,
     60): o cliente le as tres linhas como degraus de uma escada. */
  if (kbTex.length) {
      itens.push({
        id: 'kbtex', titulo: '🔔 Kettlebell Oficial Texturizado',
        texto: mensagemKettlebellTexturizado(kbTex),
        video: '',
        fotos: fotosDaLinha(kbTex, 1),
      });
  }
  if (kbHib.length) {
      itens.push({
        id: 'kbhib', titulo: '🔔 Kettlebell Híbrido Vulcanizado',
        texto: mensagemKettlebellHibrido(kbHib),
        video: '',
        // Sem foto no catalogo ainda: vai so o texto ate as imagens subirem.
        fotos: fotosDaLinha(kbHib, 1),
      });
  }
  if (bmpBlack.length) {
      itens.push({
        id: 'bumperblack', titulo: '⚫ Anilha Black Bumper 2.0',
        texto: mensagemBumperBlack(bmpBlack),
        video: '',
        // A foto da linha mostra a escrita colorida de cada peso; a do SKU nao.
        fotos: [FOTO_LINHA_BLACK],
      });
  }
  if (bmpCollor.length) {
      itens.push({
        id: 'bumpercollor', titulo: '🔴 Anilha Bumper Collor 2.0',
        texto: mensagemBumperCollor(bmpCollor),
        video: '',
        /* Uma foto so, com as cinco cores lado a lado. Antes eram duas (azul e
           vermelha) porque nenhuma foto sozinha mostrava a linha — a do Leo
           mostra, e duas fotos viraram repeticao. */
        fotos: [FOTO_LINHA_COLLOR],
      });
  }
  if (por.hy10p || por.hy20p || por.hy30p) {
      itens.push({
        id: 'sandbag', titulo: '🎒 Sandbag Hybrid Pro Series',
        texto: mensagemSandbag(por.hy10p, por.hy20p, por.hy30p),
        video: por.hy20p?.video || por.hy10p?.video || por.hy30p?.video || '',
        foto: primeiraFoto(por.hy20p, por.hy10p, por.hy30p),
      });
  }

  /* Anexo do envio: o video quando existe, senao a(s) foto(s) do produto.
     Produto sem video (as sandbags, por ora) ia so com texto — e a imagem faz
     o cliente ver o que esta comprando. `video` continua separado porque o
     painel instalado baixa esse campo assumindo .mp4; `midia` idem, para as
     versoes do painel anteriores a esta. */
  for (const item of itens) {
    item.midias = item.video ? [item.video] : (item.fotos || [item.foto]).filter(Boolean);
    item.midia = item.midias[0] || '';
  }

  return itens;
}

export async function produtosFss(req, res) {
  try {
    const itens = await montarItens();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ ok: true, itens, rapidas: RAPIDAS });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

/* enviarProdutoCliente — POST /api/bling?acao=enviar_produto_cliente
   body: { telefone, id }  (id de um item de montarItens)

   Manda o video e o texto do produto direto no WhatsApp do cliente via
   BotConversa — o caminho "zero toque" da central mobile. So funciona para
   conversas do numero BotConversa (FSS tem numero proprio) e dentro da janela
   de 24h da Meta; fora dela o erro do BotConversa e repassado. */
/* ── Fotos PNG não chegam pelo WhatsApp ────────────────────────────────────
   Diagnóstico de 15/09/2026, com envios reais ao número do Léo:
     A) PNG original do Iron ............. não chegou
     B) mesmo PNG sem metadado ........... não chegou
     C) PNG do Texturizado (controle) .... não chegou
     D) mesmos pixels do Iron, em JPEG ... CHEGOU
   A BotConversa aceita PNG com transparência (responde 200), mas o WhatsApp
   não entrega — e ninguém avisa. O Iron (PNG + PNG) saía só com texto; Med
   Ball Colorida e Texturizado perdiam a foto PNG e mostravam só a JPG, por
   isso passaram despercebidos.

   A correção reproduz EXATAMENTE o teste D: um JPEG público no mesmo bucket,
   com extensão .jpg. Fica guardado em whatsapp-jpg/ e é reaproveitado — o
   nome do PNG já traz um carimbo de tempo, então foto trocada gera outro nome
   e nunca serve cópia velha.

   Vale só para o envio pela BotConversa (WhatsApp Web). No FSS o painel anexa
   o arquivo direto na tela e isto não foi testado lá — não mexer sem teste.
   Travado por scripts/teste-midia-entregavel.mjs. */
export function precisaConverter(url) {
  return /\.png$/i.test(String(url || '').split('?')[0]);
}

export async function pngParaJpeg(buffer) {
  /* import dinâmico, nunca no topo do arquivo: o sharp é binário nativo, e
     este módulo é importado pelo roteador api/bling.js — o mesmo que gera
     proposta e sincroniza o Bling. Se o sharp falhasse ao carregar num import
     de topo, derrubaria o roteador inteiro por causa de uma foto. */
  const sharp = (await import('sharp')).default;
  return sharp(buffer)
    // Sem isto, as áreas transparentes saem PRETAS: o produto apareceria
    // num quadro preto, pior do que não mandar foto.
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer();
}

async function midiaEntregavel(url) {
  if (!precisaConverter(url)) return url;
  try {
    const base = `${process.env.VITE_SUPABASE_URL}/storage/v1/object/public/produtos_media`;
    const nome = String(url).split('?')[0].split('/').pop().replace(/\.png$/i, '.jpg');
    const caminho = `whatsapp-jpg/${nome}`;
    const publica = `${base}/${caminho}`;

    const jaTem = await fetch(publica, { method: 'HEAD' });
    if (jaTem.ok) return publica;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`baixar o PNG deu HTTP ${r.status}`);
    const jpg = await pngParaJpeg(Buffer.from(await r.arrayBuffer()));

    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const { error } = await supabase.storage.from('produtos_media')
      .upload(caminho, jpg, { contentType: 'image/jpeg', upsert: true });
    if (error) throw new Error(error.message);
    return publica;
  } catch (e) {
    /* Pior caso = o comportamento de antes (o PNG vai e não chega). Uma foto
       não pode impedir o texto com os preços de sair. */
    console.error('[fss-produtos] PNG->JPG falhou, mandando o original:', e.message);
    return url;
  }
}

export async function enviarProdutoCliente(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const apiKey = process.env.BOTCONVERSA_API_KEY;
    if (!apiKey) return res.status(500).json({ ok: false, error: 'BOTCONVERSA_API_KEY não configurada na Vercel.' });

    const { telefone, id } = req.body || {};
    const tel = telefoneWhatsappBR(telefone);
    if (!tel || tel.length < 12) return res.status(400).json({ ok: false, error: 'Telefone inválido.' });

    const item = (await montarItens()).find((i) => i.id === id);
    if (!item) return res.status(404).json({ ok: false, error: `Produto "${id}" não encontrado.` });

    /* Envio manual: o consultor conferiu o numero na tela, entao criamos o
       contato se nao existir — mesmo criterio do envio manual de proposta. */
    let subscriberId = null;
    const busca = await bcFetch(`/subscriber/get_by_phone/+${tel}/`, 'GET', null, apiKey);
    if (busca.ok) subscriberId = busca.json?.id ?? null;
    if (!subscriberId) {
      const criado = await bcFetch('/subscriber/', 'POST', {
        phone: `+${tel}`, first_name: 'Cliente', last_name: 'BRAVE',
      }, apiKey);
      subscriberId = criado.json?.id ?? null;
      if (!subscriberId) {
        return res.status(502).json({ ok: false, error: `Falha ao criar contato no BotConversa: ${criado.texto.slice(0, 200)}` });
      }
  }

    const enviar = (body) => bcFetch(`/subscriber/${subscriberId}/send_message/`, 'POST', body, apiKey);

    /* Midia primeiro, texto por ultimo — o texto (com precos) fica visivel na
       conversa. Midia e o video; nao havendo, a foto do produto. */
    for (const original of item.midias || []) {
      // PNG não chega pelo WhatsApp mesmo com a BotConversa aceitando: vira
      // JPEG antes de sair (diagnóstico e testes em midiaEntregavel).
      const midia = await midiaEntregavel(original);
      const rv = await enviar({ type: 'file', value: midia });
      if (!rv.ok) {
        return res.status(502).json({ ok: false, error: `BotConversa recusou a mídia (HTTP ${rv.status}): ${rv.texto.slice(0, 250)}` });
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    const rt = await enviar({ type: 'text', value: item.texto });
    if (!rt.ok) {
      return res.status(502).json({ ok: false, error: `A mídia foi, mas o texto falhou (HTTP ${rt.status}): ${rt.texto.slice(0, 250)}` });
    }

    console.log('[fss-produtos] envio BotConversa:', { id, tel, midias: (item.midias || []).length });
    return res.status(200).json({ ok: true, id, midias: (item.midias || []).length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
