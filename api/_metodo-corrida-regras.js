/* Regras PURAS da apresentação do método corridahibrida.com.br aos clientes que o
 * Léo atendeu (sem rede, sem banco — o motor em _metodo-corrida.js só carrega os
 * dados e envia). Separado para dar para testar.
 *
 * Decisões do Léo (12/10/2026):
 *  - só cliente que ELE atendeu: no HUB todo orçamento é dele, então a base são as
 *    vendas aprovadas daqui (os compradores do Bling sem vendedor conhecido ficam fora);
 *  - cliente de negócio (CNPJ, box, academia, studio) recebe; PESSOA FÍSICA recebe se
 *    comprou item ligado à prova (as estações e a arena);
 *  - uso próprio declarado fica fora; quem respondeu ou pediu para sair, também;
 *  - a mensagem NÃO cita o produto comprado (texto curto);
 *  - um toque e um reforço 10 dias depois, só para quem não respondeu. Depois, silêncio;
 *  - tudo automático, sem passo manual. */

export const LINK_ARENA = 'https://www.corridahibrida.com.br/arena?utm_source=brave';

export const MIN_DIAS_APOS_VENDA = 7;     // não cobrar quem acabou de comprar / aguarda entrega
export const DIAS_PARA_ANTIGA = 90;       // acima disso a abertura é a de "faz um tempo"
export const REFORCO_APOS_DIAS = 10;      // segundo toque, só para quem não respondeu

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/* Os 8 últimos dígitos: DDI e nono dígito entram e saem conforme a origem do cadastro
   (a mesma regra que o follow-up já usa). Número curto demais não é celular. */
export function tel8(t) {
  const d = String(t || '').replace(/\D/g, '');
  return d.length >= 10 ? d.slice(-8) : '';
}

/* Estações e arena de uma prova de corrida híbrida (nome do item como está no
   orçamento). Bike, esteira e escada NÃO contam — decisão do Léo. */
const PROVA = [
  /ski ?erg|\bski\b/i,
  /\bsled\b|treno|trenó/i,
  /corda.*sled|tech rope|sled.*corda/i,
  /\bremo\b|rower|row ?erg/i,
  /sand ?bag|bulgarian|strong bag|saco de areia/i,
  /wall ?ball|med(icine)? ?ball/i,
  /kettlebell/i,
  /\bturf\b|grama/i,
];
export const temItemDeProva = (nomes) => PROVA.some((rx) => rx.test(nomes));

/* Palavras que denunciam nome de empresa: "Oi, Centro!" seria pior que "Oi!". */
const EMPRESA = /\b(ltda|eireli|epp|mei|me|s\/?a|academia|box|centro|crossfit|cross|studio|estudio|fitness|treinamento|treino|clube|gym|performance|arena|team|wod|funcional|esporte|esportes|sports?|personal|sa[uú]de|condicionamento|f[ií]sico|institut[oa]|assessoria|escola|grupo|ct)\b/i;

/* Primeiro nome só quando parece nome de pessoa; senão, vazio (a saudação some o nome). */
export function primeiroNome(nome) {
  const limpo = String(nome || '').replace(/\(.*?\)/g, ' ').replace(/[^\p{L}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!limpo || EMPRESA.test(limpo)) return '';
  const p = limpo.split(' ')[0];
  if (p.length < 2) return '';
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
}

/* ── Textos (aprovados pelo Léo) ─────────────────────────────────────────── */
const saudacao = (nome) => `Oi${nome ? `, ${nome}` : ''}! Aqui é o Léo Berg, da BRAVE 👊`;

const CORPO = [
  'Além dos equipamentos, sou o fundador do método corridahibrida.com.br: a estrutura completa para organizar uma corrida híbrida (formato, marca, site com inscrição, divulgação, patrocínio e a largada).',
  '',
  'Com o método, o dono de CT ou academia vira o dono da corrida híbrida da própria região. Ele já roda na UAIROX, Teixeira ROX, TERÊ, GV Fitness Run, Piauí ROX e MOVA.',
  '',
  'Montei uma página só para os clientes BRAVE mostrando como isso funciona:',
  LINK_ARENA,
  '',
  'Dá uma olhada e, se fizer sentido para a sua região, me chama aqui 🏁',
].join('\n');

export function mensagem({ etapa, variante, nome }) {
  if (etapa === 2) {
    return [
      `${nome ? `${nome}, só` : 'Só'} passando para deixar o link caso você não tenha visto:`,
      LINK_ARENA,
      'Se não for o momento, sem problema, é só me avisar 🙂',
    ].join('\n');
  }
  if (variante === 'antiga') {
    return `${saudacao(nome)} Faz um tempo que a gente se falou e queria te mostrar uma coisa.\n\n${CORPO}`;
  }
  return `${saudacao(nome)}\n\n${CORPO}`;
}

/* ── Quem é o público ────────────────────────────────────────────────────── */
const ISO = (s) => { const t = Date.parse(s || ''); return Number.isNaN(t) ? null : t; };

/* Uma linha por CLIENTE (telefone), a partir das vendas aprovadas. */
export function montarBase({ orcamentos, clientes }) {
  /* `clientes` repete telefone (41 duplicados em 12/10/2026, 20 com classificação
     conflitante: um CNPJ e um CPF do mesmo número). Pegar "o primeiro" depende da
     ordem das linhas e muda de uma leitura para outra. Por isso guardamos TODOS os
     registros do telefone e decidimos por regra: qualquer um de negócio vale. */
  const porTel = new Map();
  const porNome = new Map();
  const guardar = (mapa, chave, c) => { if (chave) (mapa.get(chave) || mapa.set(chave, []).get(chave)).push(c); };
  for (const c of clientes || []) {
    guardar(porTel, tel8(c.telefone), c);
    guardar(porNome, norm(c.nome), c);
  }

  const base = new Map();
  for (const o of orcamentos || []) {
    const pl = o.payload || {};
    const aprovado = pl.status === 'Aprovado' || o.aprovado_em;
    if (!aprovado) continue;
    const t = tel8(pl.telefoneCliente);
    if (!t) continue; // sem telefone válido não há como enviar
    const quando = ISO(o.aprovado_em) || ISO(pl.aprovado_auto?.em) || ISO(o.criado_em);
    const itens = (pl.itens || []).filter((i) => i && typeof i === 'object').map((i) => String(i.nome || ''));
    const atual = base.get(t) || { tel8: t, telefone: pl.telefoneCliente, nome: o.cliente, ultimaVenda: 0, itens: [] };
    atual.itens.push(...itens);
    if ((quando || 0) >= atual.ultimaVenda) {
      atual.ultimaVenda = quando || 0;
      atual.nome = o.cliente;
      atual.telefone = pl.telefoneCliente;
    }
    base.set(t, atual);
  }

  for (const c of base.values()) {
    const regs = porTel.get(c.tel8) || porNome.get(norm(c.nome)) || [];
    const ehNegocio = (r) => r.tipo_pessoa === 'J' || ['box', 'academia', 'studio'].includes(r.tipo_negocio || '');
    c.negocio = regs.some(ehNegocio);
    // Uso próprio só vale quando nenhum registro do mesmo número é de negócio.
    c.usoProprio = !c.negocio && regs.some((r) => r.tipo_negocio === 'uso_proprio');
    c.noCadastro = regs.length > 0;
    c.itemDeProva = temItemDeProva(c.itens.join(' | '));
  }
  return [...base.values()];
}

/* Quem é elegível E por que os outros ficam de fora (para o painel de status). */
export function selecionar({ base, optouts, respostas, estado, agora }) {
  const nowMs = agora instanceof Date ? agora.getTime() : agora;
  const contatos = estado?.contatos || {};
  const fora = { usoProprio: 0, semItemDeProva: 0, optout: 0, respondeu: 0, aguardandoDias: 0, concluido: 0, falhou: 0 };
  const etapa1 = [];
  const etapa2 = [];

  for (const c of base) {
    if (c.usoProprio) { fora.usoProprio += 1; continue; }
    if (!c.negocio && !c.itemDeProva) { fora.semItemDeProva += 1; continue; }
    if (optouts?.has(c.tel8)) { fora.optout += 1; continue; }
    if (respostas && respostas[c.tel8]) { fora.respondeu += 1; continue; }

    const h = contatos[c.tel8];
    const dias = (ms) => (nowMs - ms) / 86400000;
    if (!h || !h.e1) {
      if ((h?.tent || 0) >= 2) { fora.falhou += 1; continue; }
      if (c.ultimaVenda && dias(c.ultimaVenda) < MIN_DIAS_APOS_VENDA) { fora.aguardandoDias += 1; continue; }
      etapa1.push({ ...c, etapa: 1, variante: c.ultimaVenda && dias(c.ultimaVenda) > DIAS_PARA_ANTIGA ? 'antiga' : 'principal' });
    } else if (!h.e2) {
      const e1 = ISO(h.e1);
      if (e1 !== null && dias(e1) >= REFORCO_APOS_DIAS) etapa2.push({ ...c, etapa: 2, variante: h.v || 'principal' });
      else fora.aguardandoDias += 1;
    } else {
      fora.concluido += 1;
    }
  }

  // Negócio antes de PF; dentro de cada um, a venda mais recente primeiro.
  const ordem = (a, b) => (Number(b.negocio) - Number(a.negocio)) || (b.ultimaVenda - a.ultimaVenda);
  etapa1.sort(ordem);
  etapa2.sort((a, b) => b.ultimaVenda - a.ultimaVenda);
  return { etapa1, etapa2, fila: [...etapa2, ...etapa1], fora };
}
