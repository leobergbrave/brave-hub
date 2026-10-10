/* Montador de orçamento de musculação.
 *
 * O lead manda uma lista genérica ("01 cross, 01 leg press, 01 peck deck...")
 * e a mesma máquina existe em até 8 linhas (Light, Hard, Classic, Tech...) com
 * preço e estoque diferentes. Este módulo transforma a lista em uma matriz
 * máquina x linha, com preço e situação de estoque, e em um texto para o
 * consultor mandar. É PURO (sem rede, sem banco): o catálogo e o estoque entram
 * por parâmetro, para dar para testar e para rodar tanto na API quanto no painel.
 *
 * Regras do Léo (10/10/2026):
 *  - estoque zerado = sob encomenda, prazo de 120 dias; saldo > 0 = pronta entrega;
 *  - adutora + abdutora (ou extensora + flexora) pedidas juntas = UMA máquina Dual,
 *    quando a linha tem a Dual;
 *  - só UMA proposta por cliente vai ao Bling: aqui só se compara, quem escolhe a
 *    linha é o consultor.
 * Preço do catálogo (`preco`) é a base; o desconto por linha (abaixo) sai dele. */

export const PRAZO_ENCOMENDA_DIAS = 120;

/* Desconto por linha, direto sobre o preço de catálogo (decisão do Léo,
   10/10/2026). Light é a linha de entrada e desconta menos; as demais puxam
   mais. Dois preços: à vista (desconto maior) e a prazo em 10x sem juros. */
const DESCONTO = {
  light: { avista: 0.15, prazo: 0.05 },
};
const DESCONTO_PADRAO = { avista: 0.30, prazo: 0.15 }; // hard, classic, tech, premium, plate loaded...
const fatoresLinha = (linha) => {
  const d = DESCONTO[linha] || DESCONTO_PADRAO;
  return { avista: 1 - d.avista, prazo: 1 - d.prazo };
};
const precoAvista = (preco, linha) => Math.round(Number(preco) * fatoresLinha(linha).avista);
const precoPrazo = (preco, linha) => Math.round(Number(preco) * fatoresLinha(linha).prazo);
/* Peça de reposição e item de teste do catálogo (Paleteira R$ 100, Tubo R$ 5...)
   não é máquina: fora da matriz. A máquina mais barata do catálogo é um banco de R$ 2.880. */
const PRECO_MINIMO_MAQUINA = 1000;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/* ── Linhas ──────────────────────────────────────────────────────────────── */
export const LINHAS = {
  light:      { rotulo: 'Light',               familia: 'cabo' },
  hard:       { rotulo: 'Hard',                familia: 'cabo' },
  classic:    { rotulo: 'Classic',             familia: 'cabo' },
  tech:       { rotulo: 'Tech',                familia: 'cabo' },
  premium:    { rotulo: 'Premium',             familia: 'cabo' },
  hard_pl:    { rotulo: 'Hard Plate Loaded',   familia: 'carga' },
  classic_pl: { rotulo: 'Classic Plate Loaded', familia: 'carga' },
  square:     { rotulo: 'Square',              familia: 'carga' },
  plate:      { rotulo: 'Plate Loaded',        familia: 'carga' },
  cable:      { rotulo: 'Cable Machine',       familia: 'cabo' },
  /* Máquina cujo nome não diz a linha (F58, TY18, DZ51...): não dá para comparar
     com as outras, mas não pode sumir do orçamento. */
  avulsa:     { rotulo: 'Sem linha definida',  familia: '' },
};
/* SKUs de máquina de musculação — só eles caem em "avulsa". Sem esse filtro,
   rack de cross, suporte de anilha etc. entrariam na matriz. */
const SKU_MAQUINA = /^(BF|BH|BL|DZ|TA|TB|TM|TF|TY|HS|HF|F\d|L6)/i;

/* A ordem importa: "Hard Plate Loaded" tem que ser testada antes de "Plate Loaded". */
const REGRAS_LINHA = [
  ['light',      /linha light/],
  ['hard_pl',    /hard plate loaded/],
  ['classic_pl', /plate loaded cla+s+ic|plate loaded clasic/],
  ['square',     /plate loaded square|\bsquare\b/],
  ['hard',       /hard ?brave/],
  ['classic',    /classic ?brave/],
  ['tech',       /tech ?brave/],
  ['premium',    /premium|\bl6\d\d\b/],
  ['plate',      /plate loaded/],
  ['cable',      /cable machine/],
];

export function detectarLinha(nome) {
  const n = norm(nome);
  for (const [chave, re] of REGRAS_LINHA) if (re.test(n)) return chave;
  return null;
}

/* ── Equipamentos ────────────────────────────────────────────────────────── */
/* `n`: reconhece o NOME DO PRODUTO do catálogo. Primeira regra que casar vence,
   então os casos específicos (duais, bancos, combinações) vêm antes dos genéricos. */
const EQUIPS = [
  { k: 'multi_station',  r: 'Multi Estação',               n: /multi ?station|estacao multifuncional/ },
  { k: 'dual_leg_hack',  r: 'Leg Press/Hack (Dual)',       n: /leg press.*hack|hack.*leg press/ },
  { k: 'dual_adu_abd',   r: 'Adutora/Abdutora (Dual)',     n: /adut.*abdut|abdut.*adut/ },
  { k: 'dual_ext_flex',  r: 'Extensora/Flexora (Dual)',    n: /extensora.*flexora|flexora.*extensora/ },
  { k: 'banco_supino_reto',      r: 'Banco de Supino Reto',      n: /^banco de supino reto/ },
  { k: 'banco_supino_inclinado', r: 'Banco de Supino Inclinado', n: /^banco de supino inclinado/ },
  { k: 'banco_supino_declinado', r: 'Banco de Supino Declinado', n: /^banco de supino declinado/ },
  { k: 'banco_reto',     r: 'Banco Reto',                  n: /^banco reto/ },
  { k: 'banco_inclinavel', r: 'Banco Inclinável',          n: /^banco inclin/ },
  { k: 'banco_scott',    r: 'Banco Scott',                 n: /^banco scott/ },
  { k: 'banco_outros',   r: 'Banco',                       n: /^banco/ },
  { k: 'adutora',        r: 'Cadeira Adutora',             n: /adutora/ },
  { k: 'abdutora',       r: 'Cadeira Abdutora',            n: /abdutor/ },
  { k: 'mesa_flexora',   r: 'Mesa Flexora',                n: /m[ee]sa flexora|mexa flexora/ },
  { k: 'abdominal_lombar', r: 'Abdominal/Lombar',          n: /abdominal.*lombar|lombar.*abdominal/ },
  { k: 'lombar',         r: 'Extensão de Costas/Lombar',   n: /lombar|extensao de costas/ },
  { k: 'extensora',      r: 'Cadeira Extensora',           n: /extensora/ },
  { k: 'flexora',        r: 'Cadeira Flexora',             n: /flexora/ },
  { k: 'hack_squat',     r: 'Hack Squat',                  n: /hack/ },
  { k: 'leg_press_horizontal', r: 'Leg Press Horizontal',  n: /leg press (horizontal|linear)|linear leg press/ },
  { k: 'leg_press_45',   r: 'Leg Press 45°',               n: /leg press.*45/ },
  { k: 'leg_press_outro', r: 'Leg Press (outros)',         n: /leg press/ },
  { k: 'supino_regulavel', r: 'Supino Regulável',          n: /supino regulavel/ },
  { k: 'supino_inclinado', r: 'Supino Inclinado',          n: /^supino.*inclinad/ },
  { k: 'supino_declinado', r: 'Supino Declinado',          n: /^supino.*declinad/ },
  { k: 'supino',         r: 'Supino',                      n: /^supino/ },
  { k: 'fly',            r: 'Peck Deck / Fly',             n: /\bfly\b|pecfly|peck|full chest|crucifixo/ },
  { k: 'crossover',      r: 'CrossOver',                   n: /cross ?over|cross smith/ },
  { k: 'smith',          r: 'Smith',                       n: /smith/ },
  { k: 'rack',           r: 'Rack / Squat Stand',          n: /rack|squat stand|\bcage\b/ },
  { k: 'puxada_remada',  r: 'Puxada Alta + Remada Baixa',  n: /puxada.*remada|remada.*puxada/ },
  { k: 'puxada_alta',    r: 'Puxada Alta',                 n: /puxada|puxa alta|pulldown|pull down/ },
  { k: 'gravitron',      r: 'Gravitron',                   n: /gravitron/ },
  { k: 'remada_baixa',   r: 'Remada Baixa',                n: /remada baixa/ },
  { k: 'remada',         r: 'Remada (outras)',             n: /remada/ },
  { k: 'pullover',       r: 'Pullover',                    n: /pull ?over/ },
  { k: 'elevacao_lateral', r: 'Elevação Lateral',          n: /elevacao lateral|lateral raise/ },
  { k: 'ombro',          r: 'Desenvolvimento de Ombro',    n: /desenvolvimento|ombro/ },
  { k: 'antebraco',      r: 'Antebraço',                   n: /antebraco/ },
  { k: 'triceps',        r: 'Tríceps',                     n: /triceps|mergulho|dips|paralela/ },
  { k: 'biceps',         r: 'Bíceps',                      n: /biceps|rosca|scott/ },
  { k: 'panturrilha_sentado', r: 'Panturrilha Sentado',    n: /panturrilha.*sentad/ },
  { k: 'panturrilha',    r: 'Panturrilha em Pé',           n: /panturrilha/ },
  { k: 'gluteo',         r: 'Glúteo / Elevação Pélvica',   n: /gluteo|coice|kick ?back|kick pendulum|pelvic|quadril/ },
  { k: 'agachamento',    r: 'Agachamento / Squat',         n: /agachamento|squat|pendulo|lunge|sissy/ },
  { k: 'deadlift',       r: 'Deadlift',                    n: /deadlift/ },
  { k: 'abdominal',      r: 'Abdominal',                   n: /abdominal/ },
  { k: 'rotacao_torso',  r: 'Rotação de Torso',            n: /rotacao/ },
  { k: 'alongador',      r: 'Alongador',                   n: /alongador/ },
  { k: 'romana',         r: 'Cadeira Romana',              n: /romana/ },
  { k: 'suporte',        r: 'Suportes / Estantes',         n: /^suporte|torre de anilhas|estante/ },
];
const EQUIP_POR_CHAVE = Object.fromEntries(EQUIPS.map((e) => [e.k, e]));
export const rotuloEquip = (k) => EQUIP_POR_CHAVE[k]?.r || k;

/* Qualificadores que fazem a variante ser "menos padrão": a primária de cada
   (máquina, linha) é a que tem menos deles, depois a mais barata. */
const QUALIFICADORES = /unilateral|articulad|angulad|isolad|aberta|em pe|giratoria|pronada|naked|carenagem|ajustavel|conjugado|lateral|vertical/g;

export function classificarProduto(p) {
  const nome = p?.nome || '';
  const preco = Number(p?.preco) || 0;
  if (!nome || preco < PRECO_MINIMO_MAQUINA) return null;
  const n = norm(nome);
  const equip = EQUIPS.find((e) => e.n.test(n));
  if (!equip) return null;
  const linha = detectarLinha(nome) || (SKU_MAQUINA.test(String(p?.codigo_sku || '')) ? 'avulsa' : null);
  if (!linha) return null;
  return {
    equip: equip.k,
    linha,
    qualif: (n.match(QUALIFICADORES) || []).length,
  };
}

/* ── Interpretação da lista do lead ──────────────────────────────────────── */
/* Sinônimos como o lead escreve → máquina. `alt` são alternativas a mencionar
   quando o pedido é genérico. O primeiro que casar vence. */
const SINONIMOS = [
  { k: 'multi_station',  re: /multi ?esta[cç][aã]o|multi ?station|esta[cç][aã]o (de )?muscula|esta[cç][aã]o multi/ },
  { k: 'dual_adu_abd',   re: /adut\w*\W*(e|\/|\+|com)?\W*abdut|abdut\w*\W*(e|\/|\+|com)?\W*adut/ },
  { k: 'dual_ext_flex',  re: /extens\w*\W*(e|\/|\+|com)?\W*flex|flex\w*\W*(e|\/|\+|com)?\W*extens/ },
  { k: 'puxada_remada',  re: /puxada\W+(e|\+|\/)\W*remada|remada\W+(e|\+|\/)\W*puxada/ },
  { k: 'leg_press_horizontal', re: /leg ?press\W*horizontal|horizontal\W*leg|leg press linear/ },
  { k: 'leg_press_45',   re: /leg ?press\W*45|45\W*leg|leg ?press|\bleg\b/, alt: ['leg_press_horizontal'] },
  { k: 'hack_squat',     re: /\bhack\b/ },
  { k: 'fly',            re: /pec ?k? ?deck|pec ?fly|peck ?fly|\bfly\b|voador|crucifixo|peitoral/ },
  { k: 'crossover',      re: /cross ?over|\bcross\b|polia dupla|polias duplas/ },
  { k: 'smith',          re: /\bsmith\b/ },
  { k: 'puxada_alta',    re: /puxada|pull ?down|puxador|dorsal/, alt: ['puxada_remada'] },
  { k: 'remada_baixa',   re: /remada baixa/ },
  { k: 'remada_baixa',   re: /remada/, alt: ['remada'] },
  { k: 'gravitron',      re: /gravitron/ },
  { k: 'extensora',      re: /extensor/ },
  { k: 'mesa_flexora',   re: /mesa flexora|mesa flex/ },
  { k: 'flexora',        re: /flexor/, alt: ['mesa_flexora'] },
  { k: 'adutora',        re: /adutor/ },
  { k: 'abdutora',       re: /abdutor/ },
  { k: 'supino_inclinado', re: /supino\W*inclin/ },
  { k: 'supino_declinado', re: /supino\W*declin/ },
  { k: 'supino',         re: /supino/, alt: ['supino_inclinado'] },
  { k: 'ombro',          re: /ombro|desenvolvimento/ },
  { k: 'elevacao_lateral', re: /eleva[cç][aã]o lateral/ },
  { k: 'biceps',         re: /b[ií]ceps|rosca|scott/ },
  { k: 'triceps',        re: /tr[ií]ceps|mergulho|paralela|dips/ },
  { k: 'panturrilha',    re: /panturrilha|gemeos/ },
  { k: 'gluteo',         re: /gl[uú]teo|coice|kick ?back|pelvic/ },
  { k: 'agachamento',    re: /agachamento|squat|pendulo/ },
  { k: 'abdominal',      re: /abdominal/ },
  { k: 'lombar',         re: /lombar|extens[aã]o de costas/ },
  { k: 'rotacao_torso',  re: /rota[cç][aã]o/ },
  { k: 'rack',           re: /\brack\b|gaiola/ },
  { k: 'banco_reto',     re: /banco reto/ },
  { k: 'banco_inclinavel', re: /banco inclin/ },
  { k: 'romana',         re: /romana/ },
];

/* Separa a lista em itens: quebra de linha, vírgula, ponto e vírgula, "•", "+"
   e " e " (mas não corta "adutora e abdutora": o par é tratado como Dual). */
function dividir(texto) {
  const lim = String(texto || '').replace(/\r/g, '\n');
  const blocos = lim.split(/[\n;•·]+|(?<=\D)\s*,\s*|,\s*(?=\D)/);
  const itens = [];
  for (const b of blocos) {
    const t = b.trim().replace(/^[-–—*]+\s*/, '');
    if (!t) continue;
    // " e " separa itens, exceto quando une os dois lados de um par Dual.
    const partes = t.split(/\s+e\s+(?=\d+\s*(x|un|unid)?\b)/i);
    itens.push(...partes);
  }
  return itens;
}

export function interpretarLista(texto) {
  const itens = [];
  const desconhecidos = [];
  for (const bruto of dividir(texto)) {
    const original = bruto.trim();
    if (!original) continue;
    let qtd = 1;
    let corpo = original;
    const ini = corpo.match(/^\s*(\d{1,2})\s*(?:x|un\.?|unid\.?|unidades?|und\.?)?\s+(?=\D)/i);
    const fim = corpo.match(/\s+(?:x\s*)?(\d{1,2})\s*(?:x|un\.?|unidades?)?\s*$/i);
    if (ini) { qtd = Number(ini[1]); corpo = corpo.slice(ini[0].length); }
    else if (fim && /\bx\s*\d|\d\s*x\b|unid/i.test(fim[0])) { qtd = Number(fim[1]); corpo = corpo.slice(0, fim.index); }
    qtd = Math.max(1, Math.min(qtd, 50));
    const n = norm(corpo);
    const achou = SINONIMOS.find((s) => s.re.test(n));
    if (!achou) { desconhecidos.push(original); continue; }
    const existente = itens.find((i) => i.equip === achou.k);
    if (existente) { existente.qtd += qtd; existente.original += ` + ${original}`; continue; }
    itens.push({ equip: achou.k, rotulo: rotuloEquip(achou.k), qtd, original, alt: achou.alt || [] });
  }
  return { itens, desconhecidos };
}

/* ── Matriz máquina x linha ──────────────────────────────────────────────── */
/* Pares que, pedidos juntos, viram uma única máquina Dual NA LINHA que tem a Dual. */
const PARES_DUAL = [
  { a: ['adutora'], b: ['abdutora'], dual: 'dual_adu_abd' },
  { a: ['extensora'], b: ['flexora', 'mesa_flexora'], dual: 'dual_ext_flex' },
];

const PARES_COMBO = [
  { a: 'puxada_alta', b: 'remada_baixa', combo: 'puxada_remada' },
];

/* preços por linha: ver precoAvista/precoPrazo no topo do arquivo. */
const fotoValida = (u) => (/^https?:\/\//i.test(String(u || '')) && String(u).toUpperCase() !== 'SEM_FOTO_BLING' ? u : null);

function indexarCatalogo(catalogo) {
  const idx = new Map(); // `${linha}|${equip}` -> [{...produto, qualif}]
  for (const p of catalogo || []) {
    const c = classificarProduto(p);
    if (!c) continue;
    const chave = `${c.linha}|${c.equip}`;
    if (!idx.has(chave)) idx.set(chave, []);
    idx.get(chave).push({ ...p, preco: Number(p.preco), qualif: c.qualif });
  }
  for (const lista of idx.values()) lista.sort((x, y) => x.qualif - y.qualif || x.preco - y.preco);
  return idx;
}

function situacaoEstoque(qtd, saldo) {
  if (saldo === undefined || saldo === null) return { status: 'consultar', pronta: 0, encomenda: 0 };
  const pronta = Math.max(0, Math.min(qtd, Math.floor(Number(saldo) || 0)));
  return { status: pronta >= qtd ? 'pronta' : (pronta > 0 ? 'parcial' : 'encomenda'), pronta, encomenda: qtd - pronta };
}

export function montarOpcoes(itens, catalogo, estoque = {}) {
  const idx = indexarCatalogo(catalogo);
  const linhasComProduto = [...new Set([...idx.keys()].map((k) => k.split('|')[0]))];
  const resultado = [];

  for (const linha of linhasComProduto) {
    const pendentes = new Map(itens.map((i) => [i.equip, i.qtd]));
    const montados = [];
    const faltando = [];
    const celula = (equip) => idx.get(`${linha}|${equip}`)?.[0] || null;

    // 1) Duais: só onde a linha tem a máquina Dual.
    for (const par of PARES_DUAL) {
      const chaveA = par.a.find((k) => pendentes.has(k));
      const chaveB = par.b.find((k) => pendentes.has(k));
      const dual = celula(par.dual);
      if (!chaveA || !chaveB || !dual) continue;
      const q = Math.min(pendentes.get(chaveA), pendentes.get(chaveB));
      montados.push({ equip: par.dual, qtd: q, produto: dual, dual: true, variantes: idx.get(`${linha}|${par.dual}`).length - 1 });
      for (const k of [chaveA, chaveB]) {
        const resto = pendentes.get(k) - q;
        if (resto > 0) pendentes.set(k, resto); else pendentes.delete(k);
      }
    }
    // 2) Combinada (puxada + remada numa máquina só): só quando a linha NÃO tem as
    //    duas separadas — onde tem, o lead pediu duas máquinas e recebe duas.
    for (const par of PARES_COMBO) {
      if (!pendentes.has(par.a) || !pendentes.has(par.b)) continue;
      const combo = celula(par.combo);
      if (!combo || (celula(par.a) && celula(par.b))) continue;
      const q = Math.min(pendentes.get(par.a), pendentes.get(par.b));
      montados.push({ equip: par.combo, qtd: q, produto: combo, dual: true, variantes: idx.get(`${linha}|${par.combo}`).length - 1 });
      for (const k of [par.a, par.b]) {
        const resto = pendentes.get(k) - q;
        if (resto > 0) pendentes.set(k, resto); else pendentes.delete(k);
      }
    }
    // 3) Demais itens, na ordem em que o lead pediu (inclui a Dual pedida direto, ex.: "adutora/abdutora").
    for (const it of itens) {
      if (!pendentes.has(it.equip)) continue;
      const qtd = pendentes.get(it.equip);
      pendentes.delete(it.equip);
      const candidatos = [it.equip, ...(it.alt || [])];
      // Dual pedida e a linha não tem: oferece as duas separadas.
      const par = PARES_DUAL.find((p) => p.dual === it.equip);
      if (par && !celula(it.equip)) {
        for (const parte of [par.a[0], par.b[0]]) {
          const prod = celula(parte);
          if (prod) montados.push({ equip: parte, qtd, produto: prod, dual: false, variantes: idx.get(`${linha}|${parte}`).length - 1 });
          else faltando.push(rotuloEquip(parte));
        }
        continue;
      }
      const usado = candidatos.find((k) => celula(k));
      if (usado) montados.push({ equip: usado, qtd, produto: celula(usado), dual: false, variantes: idx.get(`${linha}|${usado}`).length - 1, trocou: usado !== it.equip, pedido: it.rotulo });
      else faltando.push(it.rotulo || rotuloEquip(it.equip));
    }

    if (!montados.length) continue;
    const linhasOrc = montados.map((m) => {
      const saldo = estoque[m.produto.codigo_sku];
      return {
        equip: m.equip, rotulo: rotuloEquip(m.equip), qtd: m.qtd, dual: m.dual, variantes: m.variantes,
        trocou: !!m.trocou, pedido: m.trocou ? m.pedido : undefined,
        produto: {
          sku: m.produto.codigo_sku, nome: m.produto.nome, preco: m.produto.preco,
          avista: precoAvista(m.produto.preco, linha),
          prazo: precoPrazo(m.produto.preco, linha),
          foto: fotoValida(m.produto.url_imagem),
        },
        estoque: situacaoEstoque(m.qtd, saldo),
      };
    });
    resultado.push({
      linha, rotulo: LINHAS[linha]?.rotulo || linha, familia: LINHAS[linha]?.familia || '',
      itens: linhasOrc, faltando,
      total_prazo: linhasOrc.reduce((s, i) => s + i.produto.prazo * i.qtd, 0),
      total_avista: linhasOrc.reduce((s, i) => s + i.produto.avista * i.qtd, 0),
      cobre: itens.length - faltando.length,
      de: itens.length,
    });
  }
  resultado.sort((x, y) => (y.cobre - x.cobre) || (x.total_avista - y.total_avista));
  return resultado;
}

/* ── Quais linhas mostrar ────────────────────────────────────────────────── */
/* Padrão (decisão do Léo, 10/10/2026): só as quatro linhas de cabo. Plate Loaded
   entra se o lead pedir ("plate", "carga", "anilha"...) ou com `todas`. O que
   nenhuma linha mostrada tem, mas existe em outra, vai em `complementos`. */
const LINHAS_PADRAO = ['light', 'hard', 'classic', 'tech'];
const PEDIU_CARGA = /plate|carga|anilha|placa|livre/;

export function escolherLinhas(resultado, itens, { texto = '', todas = false } = {}) {
  const querCarga = todas || PEDIU_CARGA.test(norm(texto));
  const mostrar = (l) => todas
    || LINHAS_PADRAO.includes(l.linha)
    || (querCarga && l.familia === 'carga');
  let linhas = resultado.filter(mostrar);
  let ampliado = false;
  if (!linhas.length) { linhas = resultado; ampliado = true; } // nada nas linhas padrão: não devolve vazio
  const fora = resultado.filter((l) => !linhas.includes(l));

  const complementos = [];
  const naoEncontrados = [];
  if (linhas.length) {
    const rotulosPedidos = itens.map((i) => i.rotulo || rotuloEquip(i.equip));
    for (const rotulo of rotulosPedidos) {
      if (linhas.some((l) => !l.faltando.includes(rotulo))) continue; // alguma linha mostrada cobre
      const candidatos = fora.flatMap((l) => l.itens
        .filter((i) => i.rotulo === rotulo || i.pedido === rotulo)
        .map((i) => ({ ...i, linha: l.linha, linhaRotulo: l.rotulo })));
      candidatos.sort((a, b) => a.produto.avista - b.produto.avista);
      if (candidatos[0]) complementos.push(candidatos[0]);
      else naoEncontrados.push(rotulo);
    }
  }
  return { linhas, complementos, naoEncontrados, ampliado, querCarga };
}

/* ── Texto para o WhatsApp ───────────────────────────────────────────────── */
const brl = (v) => {
  const n = Number(v) || 0;
  const inteiro = Math.abs(n - Math.round(n)) < 0.005;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: inteiro ? 0 : 2, maximumFractionDigits: inteiro ? 0 : 2 });
};

function textoEstoque(e, qtd) {
  if (e.status === 'consultar') return 'estoque a confirmar';
  if (e.status === 'pronta') return `pronta entrega${qtd > 1 ? ` (${qtd})` : ''}`;
  if (e.status === 'parcial') return `${e.pronta} em pronta entrega, ${e.encomenda} sob encomenda (${PRAZO_ENCOMENDA_DIAS} dias)`;
  return `sob encomenda (${PRAZO_ENCOMENDA_DIAS} dias)`;
}

export function mensagemComparativa(resultado, { desconhecidos = [], maxLinhas = 4, complementos = [], estoqueEm = null } = {}) {
  if (!resultado.length) return 'Não encontrei essas máquinas no catálogo — me confirma os modelos que você precisa?';
  const out = ['Montei suas opções de musculação por linha:'];
  for (const L of resultado.slice(0, maxLinhas)) {
    out.push('');
    const titulo = L.linha === 'avulsa' ? 'Outras opções (sem linha definida)' : `Linha ${L.rotulo}`;
    out.push(`*${titulo}* — ${brl(L.total_avista)} à vista ou 10x de ${brl(L.total_prazo / 10)}${L.cobre < L.de ? ` (cobre ${L.cobre} de ${L.de})` : ''}`);
    for (const i of L.itens) {
      const q = i.qtd > 1 ? `${i.qtd}x ` : '';
      const no_lugar = i.trocou ? ` (opção para "${i.pedido}")` : '';
      out.push(`• ${q}${i.produto.nome}${no_lugar} — ${brl(i.produto.avista)} à vista · ${textoEstoque(i.estoque, i.qtd)}`);
    }
    if (L.faltando.length) out.push(`  Não tem nesta linha: ${L.faltando.join(', ')}`);
  }
  if (complementos.length) {
    out.push('');
    out.push('*Também temos, em outra linha:*');
    for (const c of complementos) {
      const q = c.qtd > 1 ? `${c.qtd}x ` : '';
      out.push(`• ${q}${c.produto.nome} — ${brl(c.produto.avista)} à vista · ${textoEstoque(c.estoque, c.qtd)}`);
    }
  }
  if (desconhecidos.length) {
    out.push('');
    out.push(`Para confirmar com você: ${desconhecidos.join('; ')}`);
  }
  out.push('');
  out.push('Preços à vista e a prazo (10x sem juros) já com o desconto de cada linha.');
  if (estoqueEm) out.push(`Estoque conferido em ${estoqueEm}.`);
  out.push('Qual linha faz mais sentido para o seu espaço?');
  return out.join('\n');
}

/* Texto de UMA linha, para mandar junto com as fotos daquela linha (o consultor
   envia linha por linha, cada uma como uma mensagem com suas máquinas e fotos). */
export function mensagemLinha(L, { estoqueEm = null } = {}) {
  const titulo = L.linha === 'avulsa' ? 'Outras opções (sem linha definida)' : `Linha ${L.rotulo}`;
  const out = [`*${titulo}*`, ''];
  for (const i of L.itens) {
    const q = i.qtd > 1 ? `${i.qtd}x ` : '';
    const no_lugar = i.trocou ? ` (opção para "${i.pedido}")` : '';
    out.push(`• ${q}${i.produto.nome}${no_lugar} — ${brl(i.produto.avista)} à vista · ${textoEstoque(i.estoque, i.qtd)}`);
  }
  if (L.faltando.length) out.push(`Não tem nesta linha: ${L.faltando.join(', ')}`);
  out.push('');
  out.push(`Total: ${brl(L.total_avista)} à vista ou 10x de ${brl(L.total_prazo / 10)} (sem juros).`);
  if (estoqueEm) out.push(`Estoque conferido em ${estoqueEm}.`);
  return out.join('\n');
}
