// scripts/teste-metodo-corrida.mjs — trava as regras da apresentação do método
// corridahibrida.com.br aos clientes que o Léo atendeu (decisões de 12/10/2026).
// Dados FICTÍCIOS: nada de banco, nada de BotConversa.
//
// Rodar:  node scripts/teste-metodo-corrida.mjs
import assert from 'node:assert/strict';
import {
  tel8, primeiroNome, temItemDeProva, montarBase, selecionar, mensagem,
  LINK_ARENA, MIN_DIAS_APOS_VENDA, REFORCO_APOS_DIAS, DIAS_PARA_ANTIGA,
} from '../api/_metodo-corrida-regras.js';

const DIA = 86400000;
const AGORA = Date.parse('2026-10-12T15:00:00Z');
const dias = (n) => new Date(AGORA - n * DIA).toISOString();

// ── telefone ────────────────────────────────────────────────────────────────
assert.equal(tel8('(31) 98947-8450'), '47878450'.slice(0, 0) + '89478450');
assert.equal(tel8('+55 31 98947-8450'), '89478450', 'DDI não muda a chave');
assert.equal(tel8('3198947845'), '98947845');
assert.equal(tel8('12345'), '', 'número curto não é celular');
assert.equal(tel8(null), '');

// ── nome: só pessoa; empresa vira saudação sem nome ─────────────────────────
assert.equal(primeiroNome('Letícia Coimbra de Aguiar Pereira'), 'Letícia');
assert.equal(primeiroNome('norton nichelle'), 'Norton');
assert.equal(primeiroNome('Daniel Pereira Neves (BRISA FITNESS)'), 'Daniel');
assert.equal(primeiroNome('centro treinamento galpão 57'), '');
assert.equal(primeiroNome('Mcbonato Arena Blackcross Assessoria Esportiva Ltda'), '');
assert.equal(primeiroNome('VS Condicionamento Físico e Saúde'), '');
assert.equal(primeiroNome('Famled publicidade Ltda'), '');
assert.equal(primeiroNome(''), '');
assert.equal(primeiroNome('12345'), '');

// ── item de prova: estações e arena; bike/esteira/escada NÃO contam ──────────
for (const ok of [
  'SkiErg com Plataforma', 'Remo Indoor Profissional', 'Sled Nacional 25kg', 'Corda para Sled Tech Rope 38mm',
  'Sandbag Hybrid Pro Series', 'Medicine Ball 20LB - Pro Series', 'Kettlebell Iron 24kg',
  'TURF Oficial 16mm - 12,5m x 2m', 'Grama Sintética VERDE-2 Raias',
]) assert.equal(temItemDeProva(ok), true, ok);
for (const nao of [
  'Storm Bike Brave', 'Esteira Curva Pro', 'Escada Ergométrica', 'Cadeira Extensora - HardBrave',
  'Barra Olímpica 20kg', 'Piso de Borracha 100x100',
]) assert.equal(temItemDeProva(nao), false, nao);

// ── base: um cliente por telefone, só venda aprovada ────────────────────────
const orc = (cliente, tel, status, quando, itens = [], extra = {}) => ({
  cliente, criado_em: quando, aprovado_em: null,
  payload: { status, telefoneCliente: tel, itens: itens.map((nome) => ({ nome })) }, ...extra,
});
const CLIENTES = [
  { nome: 'Academia Alfa Ltda', telefone: '(11) 91111-1111', tipo_pessoa: 'J', tipo_negocio: null },
  { nome: 'Bruno Box', telefone: '11922222222', tipo_pessoa: 'F', tipo_negocio: 'box' },
  { nome: 'Carla Souza', telefone: '11933333333', tipo_pessoa: 'F', tipo_negocio: null },
  { nome: 'Diego Casa', telefone: '11944444444', tipo_pessoa: 'F', tipo_negocio: 'uso_proprio' },
  { nome: 'Eva Mendes', telefone: '11955555555', tipo_pessoa: 'F', tipo_negocio: null },
];
const ORCS = [
  orc('Academia Alfa Ltda', '(11) 91111-1111', 'Aprovado', dias(20), ['Cadeira Extensora']),
  orc('Academia Alfa Ltda', '(11) 91111-1111', 'Aprovado', dias(40), ['SkiErg']),       // mesma pessoa: junta
  orc('Bruno Box', '11922222222', 'Aprovado', dias(120), ['Anilha Bumper']),             // antiga (> 90 dias)
  orc('Carla Souza', '11933333333', 'Aprovado', dias(15), ['Sled Nacional 25kg']),       // PF com item de prova
  orc('Diego Casa', '11944444444', 'Aprovado', dias(30), ['SkiErg']),                    // uso próprio: fora mesmo com prova
  orc('Eva Mendes', '11955555555', 'Aprovado', dias(25), ['Cadeira Flexora']),           // PF sem item de prova
  orc('Fabio Pendente', '11966666666', 'Pendente', dias(5), ['SkiErg']),                 // orçamento, não compra
  orc('Gabi Sem Tel', '', 'Aprovado', dias(10), ['SkiErg']),                             // sem telefone
  orc('Hugo Recente', '11977777777', 'Aprovado', dias(2), ['Turf']),                     // acabou de comprar
];
const base = montarBase({ orcamentos: ORCS, clientes: CLIENTES });
const por = Object.fromEntries(base.map((c) => [c.tel8, c]));
assert.equal(base.length, 6, 'pendente e sem telefone ficam fora; duplicata junta');
assert.equal(por['11111111'].itens.length, 2, 'itens das duas vendas somados');
assert.equal(por['11111111'].negocio, true);
assert.equal(por['11111111'].itemDeProva, true);
assert.equal(por['22222222'].negocio, true, 'box conta como negócio');
assert.equal(por['33333333'].negocio, false);
assert.equal(por['33333333'].itemDeProva, true);
assert.equal(por['44444444'].usoProprio, true);
assert.equal(por['77777777'].noCadastro, false, 'fora de clientes: segue pela regra do item');

// ── telefone repetido em `clientes`: a ordem das linhas NÃO pode mudar o resultado ──
{
  const dupA = [
    { nome: 'Ivo Dono', telefone: '11988880000', tipo_pessoa: 'F', tipo_negocio: null },
    { nome: 'Ivo Dono Ltda', telefone: '11988880000', tipo_pessoa: 'J', tipo_negocio: null },
  ];
  const o = [orc('Ivo Dono', '11988880000', 'Aprovado', dias(30), ['Cadeira Flexora'])];
  const r1 = montarBase({ orcamentos: o, clientes: dupA })[0];
  const r2 = montarBase({ orcamentos: o, clientes: [...dupA].reverse() })[0];
  assert.equal(r1.negocio, true, 'qualquer registro de negócio do mesmo número vale');
  assert.equal(r2.negocio, true, 'a ordem das linhas não muda o resultado');
  // uso próprio num registro e CNPJ em outro: negócio vence
  const mix = [
    { nome: 'Ivo', telefone: '11988880000', tipo_pessoa: 'F', tipo_negocio: 'uso_proprio' },
    { nome: 'Ivo Ltda', telefone: '11988880000', tipo_pessoa: 'J', tipo_negocio: null },
  ];
  const m = montarBase({ orcamentos: o, clientes: mix })[0];
  assert.equal(m.negocio, true);
  assert.equal(m.usoProprio, false, 'com um registro de negócio, uso próprio não exclui');
  // só uso próprio: exclui
  const so = montarBase({ orcamentos: o, clientes: [mix[0]] })[0];
  assert.equal(so.usoProprio, true);
}

// ── "FSS só pelo FSS": quem conversa no FSS não recebe pela BotConversa ───────
{
  const comOrigem = (cliente, tel, status, quando, itens, origem) => ({
    ...orc(cliente, tel, status, quando, itens), origem_lead: origem,
  });
  const clis = [{ nome: 'Joana Box', telefone: '11900001111', tipo_pessoa: 'J', tipo_negocio: 'box' }];
  // venda fechada com origem FSS
  let b = montarBase({ orcamentos: [comOrigem('Joana Box', '11900001111', 'Aprovado', dias(30), ['SkiErg'], 'FSS')], clientes: clis })[0];
  assert.equal(b.noFss, true);
  assert.equal(selecionar({ base: [b], optouts: new Set(), respostas: {}, estado: { contatos: {} }, agora: AGORA }).fora.fss, 1);
  // origem FSS num orçamento que NÃO fechou: o canal do cliente é o mesmo
  b = montarBase({
    orcamentos: [
      comOrigem('Joana Box', '11900001111', 'Aprovado', dias(30), ['SkiErg'], 'WHATSAPP'),
      comOrigem('Joana Box', '11900001111', 'Pendente', dias(60), ['Remo'], 'fss'),
    ],
    clientes: clis,
  })[0];
  assert.equal(b.noFss, true, 'qualquer orçamento FSS do número vale, em maiúsculas ou minúsculas');
  // WhatsApp puro continua elegível
  b = montarBase({ orcamentos: [comOrigem('Joana Box', '11900001111', 'Aprovado', dias(30), ['SkiErg'], 'WHATSAPP')], clientes: clis })[0];
  assert.equal(b.noFss, false);
  const ok = selecionar({ base: [b], optouts: new Set(), respostas: {}, estado: { contatos: {} }, agora: AGORA });
  assert.equal(ok.etapa1.length, 1);
  // origem desconhecida não exclui (decisão pendente do Léo)
  b = montarBase({ orcamentos: [comOrigem('Joana Box', '11900001111', 'Aprovado', dias(30), ['SkiErg'], '')], clientes: clis })[0];
  assert.equal(b.noFss, false);
}

// ── seleção ─────────────────────────────────────────────────────────────────
const sel = (extra = {}) => selecionar({
  base, optouts: new Set(), respostas: {}, estado: { contatos: {} }, agora: AGORA, ...extra,
});
let r = sel();
const t8s = (lista) => lista.map((c) => c.tel8);
assert.deepEqual(t8s(r.etapa1), ['11111111', '22222222', '33333333'], 'negócio antes de PF; o mais recente primeiro');
assert.equal(r.fora.usoProprio, 1);
assert.equal(r.fora.semItemDeProva, 1, 'Eva: PF sem item de prova');
assert.equal(r.fora.aguardandoDias, 1, `Hugo comprou há menos de ${MIN_DIAS_APOS_VENDA} dias`);
const antigaDe = (t) => r.etapa1.find((c) => c.tel8 === t).variante;
assert.equal(antigaDe('22222222'), 'antiga', `compra com mais de ${DIAS_PARA_ANTIGA} dias`);
assert.equal(antigaDe('11111111'), 'principal');

// opt-out e resposta tiram da fila, em qualquer etapa
r = sel({ optouts: new Set(['11111111']) });
assert.ok(!t8s(r.fila).includes('11111111'));
assert.equal(r.fora.optout, 1);
r = sel({ respostas: { 22222222: '2026-10-10T12:00:00Z' } });
assert.ok(!t8s(r.fila).includes('22222222'));
assert.equal(r.fora.respondeu, 1);

// reforço: só depois de REFORCO_APOS_DIAS, só quem não respondeu, e vai na frente dos novos
const e1 = (n) => ({ e1: dias(n), v: 'principal' });
r = sel({ estado: { contatos: { 11111111: e1(REFORCO_APOS_DIAS + 1), 22222222: e1(3) } } });
assert.deepEqual(t8s(r.etapa2), ['11111111']);
assert.equal(r.fila[0].tel8, '11111111');
assert.equal(r.fila[0].etapa, 2);
assert.ok(!t8s(r.fila).includes('22222222'), 'toque recente: ainda aguarda os 10 dias');
r = sel({ estado: { contatos: { 11111111: e1(REFORCO_APOS_DIAS + 1) } }, respostas: { 11111111: '2026-10-11T00:00:00Z' } });
assert.ok(!t8s(r.fila).includes('11111111'), 'respondeu depois do 1º toque: o automático para');

// depois do reforço, acabou: nunca um terceiro toque
r = sel({ estado: { contatos: { 11111111: { e1: dias(30), e2: dias(20), v: 'principal' } } } });
assert.ok(!t8s(r.fila).includes('11111111'));
assert.equal(r.fora.concluido, 1);

// duas falhas seguidas no mesmo telefone: desiste dele (sem martelar)
r = sel({ estado: { contatos: { 11111111: { tent: 2 } } } });
assert.ok(!t8s(r.fila).includes('11111111'));
assert.equal(r.fora.falhou, 1);

// ── "só fala com quem já é contato do número" (a conferência é do motor; aqui, o efeito) ──
{
  const um = base.find((c) => c.tel8 === '11111111');
  const com = (contatos) => selecionar({ base: [um], optouts: new Set(), respostas: {}, estado: { contatos }, agora: AGORA });
  assert.equal(com({}).etapa1.length, 1);
  const r2 = com({ 11111111: { semConversa: dias(1) } });
  assert.equal(r2.fila.length, 0, 'quem nunca falou com o número não entra na fila');
  assert.equal(r2.fora.semConversa, 1);
}

// ── texto ───────────────────────────────────────────────────────────────────
const p = mensagem({ etapa: 1, variante: 'principal', nome: 'Carla' });
assert.ok(p.startsWith('Oi, Carla! Aqui é o Léo Berg, da BRAVE'));
assert.ok(p.includes('fundador do método corridahibrida.com.br'));
assert.ok(p.includes('dono da corrida híbrida da própria região'));
assert.ok(p.includes(LINK_ARENA));
assert.ok(p.includes('UAIROX, Teixeira ROX, TERÊ, GV Fitness Run, Piauí ROX e MOVA'));
assert.ok(!/arena\b.*já tem|você já tem/i.test(p), 'a linha "você já tem a base" saiu do texto');
assert.ok(mensagem({ etapa: 1, variante: 'principal', nome: '' }).startsWith('Oi! Aqui é o Léo Berg'), 'sem nome, sem vírgula');
assert.ok(mensagem({ etapa: 1, variante: 'antiga', nome: 'Carla' }).includes('Faz um tempo que a gente se falou'));
const ref = mensagem({ etapa: 2, variante: 'principal', nome: 'Carla' });
assert.ok(ref.includes(LINK_ARENA) && ref.includes('Se não for o momento'));
// Nenhum texto cita produto comprado nem a marca de terceiro.
for (const t of [p, ref, mensagem({ etapa: 1, variante: 'antiga', nome: '' })]) {
  assert.ok(!/hyrox/i.test(t), 'marca de terceiro');
  assert.ok(!/skierg|sled|remo|turf|kettlebell|sandbag/i.test(t), 'a mensagem não cita o produto');
}
assert.ok(p.length < 700, 'texto curto');

// ── o motor nasce DESLIGADO ─────────────────────────────────────────────────
process.env.VITE_SUPABASE_URL ||= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const motor = await import('../api/_metodo-corrida.js');
assert.equal(motor.LIGADO, false, 'só liga com ordem explícita do Léo (commit que troca este valor e este teste)');

console.log('OK — base, elegibilidade, reforço, opt-out/resposta, textos sem produto e motor desligado');
