// scripts/teste-musculacao-montador.mjs — trava as regras do montador de orçamento
// de musculação (10/10/2026): linha pelo nome, máquina Dual quando a linha tem,
// estoque zero = sob encomenda 120 dias; desconto por linha (Light 15%/5%, demais 30%/15%).
//
// Catálogo e estoque são FICTÍCIOS (nomes e preços copiados do cadastro real,
// saldos inventados) — o teste não toca em Bling nem em banco.
//
// Rodar:  node scripts/teste-musculacao-montador.mjs
import assert from 'node:assert/strict';
import {
  detectarLinha, classificarProduto, interpretarLista, montarOpcoes, mensagemComparativa,
  escolherLinhas, PRAZO_ENCOMENDA_DIAS,
} from '../api/_musculacao-montador.js';

// ── 1) Linha pelo texto do nome ─────────────────────────────────────────────
const L = detectarLinha;
assert.equal(L('Cadeira Extensora - HardBrave'), 'hard');
assert.equal(L('Cadeira Extensora - ClassicBrave'), 'classic');
assert.equal(L('Cadeira Extensora - TechBrave'), 'tech');
assert.equal(L('Cadeira Extensora - Linha Light'), 'light');
assert.equal(L('Smith Machine - Hard Plate Loaded'), 'hard_pl');
assert.equal(L('Supino Reto Articulado - Plate Loaded'), 'plate');
assert.equal(L('Banco Reto - Square Brave'), 'square');
assert.equal(L('Agachamento com Cinto - Plate Loaded Classic'), 'classic_pl');
assert.equal(L('Elevação Pélvica com Cinto - Plate Loaded Clasic'), 'classic_pl', 'o cadastro tem a grafia "Clasic"');
assert.equal(L('Leg Press Horizontal Premium'), 'premium');
assert.equal(L('Puxa Alta e Baixa com Cabo  -  Cable Machine'), 'cable');
assert.equal(L('Hack Press Squat 45º'), null, 'sem linha no nome');
// "Hard Plate Loaded" NÃO pode virar "Plate Loaded" genérico nem "Hard" (cabo).
assert.notEqual(L('Puxada Alta - Hard Plate Loaded'), 'hard');
assert.notEqual(L('Puxada Alta - Hard Plate Loaded'), 'plate');

// ── 2) Máquina (equipamento) a partir do nome ───────────────────────────────
const C = (nome, preco = 20000, sku = 'XX1') => classificarProduto({ nome, preco, codigo_sku: sku });
assert.equal(C('Cadeira Extensora/Flexora (Dual) - ClassicBrave').equip, 'dual_ext_flex');
assert.equal(C('Mexa Flexora e Cadeira Extensora (Dual) - HardBrave').equip, 'dual_ext_flex', 'erro de digitação do cadastro');
assert.equal(C('Cadeira Adutora/Abdutora (Dual) - HardBrave').equip, 'dual_adu_abd');
assert.equal(C('Cadeira Abdutora/Adutora - Linha Light').equip, 'dual_adu_abd');
assert.equal(C('Cadeira Adutora - HardBrave').equip, 'adutora');
assert.equal(C('Abdutor em Pé - Plate Loaded').equip, 'abdutora');
assert.equal(C('Mesa Flexora - ClassicBrave').equip, 'mesa_flexora');
assert.equal(C('Cadeira Flexora - TechBrave').equip, 'flexora');
// Extensão de costas/tríceps NÃO é cadeira extensora.
assert.equal(C('Extensão de Costas - HardBrave').equip, 'lombar');
assert.equal(C('Extensão de Tríceps - Plate Loaded Classic').equip, 'triceps');
assert.equal(C('Abdominal e Extensão Lombar - HardBrave').equip, 'abdominal_lombar');
assert.equal(C('Banco de Supino Declinado para Barra de Peso Livre - Classic Brave').equip, 'banco_supino_declinado');
assert.equal(C('Supino Regulável - Reto, Inclinado, Declinável - Square Brave').equip, 'supino_regulavel');
assert.equal(C('Fly Peitoral e Ombros - HardBrave').equip, 'fly');
assert.equal(C('PecFly e Dorsal - Linha Light').equip, 'fly');
assert.equal(C('Puxa Alta e Baixa com Cabo  -  Cable Machine').equip, 'puxada_alta');
assert.equal(C('Puxada Alta e Remada Baixa Single - Linha Light').equip, 'puxada_remada');
assert.equal(C('Leg Press/Hack 45 - (Dual) - Square Brave').equip, 'dual_leg_hack');
assert.equal(C('Leg Press 45 Graus - ClassicBrave').equip, 'leg_press_45');
assert.equal(C('Leg Press Horizontal - HardBrave').equip, 'leg_press_horizontal');
assert.equal(C('Cross Over com Carenagens - Square Brave').equip, 'crossover');
assert.equal(C('Máquina Smith - ClassicBrave').equip, 'smith');
assert.equal(C('Hack Squat 45 - Hard Plate Loaded').equip, 'hack_squat');

// Item de teste / peça de reposição do catálogo não é máquina.
assert.equal(C('Paleteira', 100), null);
assert.equal(C('Tubo feminina', 5), null);
assert.equal(C('Puxada Alta Isolada - ClassicBrave', 0), null, 'preço zero (cadastro incompleto) fica de fora');
// Cardio com "Premium" no nome tem linha, mas não tem máquina de musculação.
assert.equal(C('Esteira Premium Flow - Painel em LED'), null);
// Sem linha no nome: só vira "avulsa" se o SKU for de máquina.
assert.equal(C('KickBack para Glúteos', 16990, 'TY18').linha, 'avulsa');
assert.equal(C('KickBack para Glúteos', 16990, 'XPTO'), null);

// ── 3) Lista do lead ────────────────────────────────────────────────────────
const lista = (t) => interpretarLista(t);
{
  const r = lista('01 cross, 01 leg press, 01 peck deck');
  assert.deepEqual(r.itens.map((i) => [i.equip, i.qtd]), [['crossover', 1], ['leg_press_45', 1], ['fly', 1]]);
  assert.deepEqual(r.desconhecidos, []);
}
{
  const r = lista('2 extensoras\nflexora x3\n- Puxada alta\n- Remada\n• mesa flexora');
  assert.deepEqual(r.itens.map((i) => [i.equip, i.qtd]),
    [['extensora', 2], ['flexora', 3], ['puxada_alta', 1], ['remada_baixa', 1], ['mesa_flexora', 1]]);
}
{
  // Par pedido junto na mesma frase = uma Dual.
  assert.deepEqual(lista('adutora/abdutora').itens.map((i) => i.equip), ['dual_adu_abd']);
  assert.deepEqual(lista('1 extensora e flexora').itens.map((i) => i.equip), ['dual_ext_flex']);
}
{
  const r = lista('leg press horizontal, 2 esteiras, supino inclinado');
  assert.deepEqual(r.itens.map((i) => i.equip), ['leg_press_horizontal', 'supino_inclinado']);
  assert.deepEqual(r.desconhecidos, ['2 esteiras'], 'o que não é máquina volta para o consultor confirmar');
}
{
  const r = lista('extensora, 1 extensora');
  assert.deepEqual(r.itens.map((i) => [i.equip, i.qtd]), [['extensora', 2]], 'repetido soma');
  assert.equal(lista('99 extensora').itens[0].qtd, 50, 'quantidade absurda é limitada');
}

// ── 4) Matriz máquina x linha ───────────────────────────────────────────────
const p = (sku, nome, preco, foto = 'https://x.supabase.co/storage/v1/object/public/produtos_media/a.jpg') =>
  ({ codigo_sku: sku, nome, preco, url_imagem: foto });
const CATALOGO = [
  // Hard: tem a Dual de adutora/abdutora, mas não a de extensora/flexora
  p('HS13', 'Cadeira Extensora - HardBrave', 16740),
  p('HS14', 'Cadeira Flexora - HardBrave', 16740),
  p('HS16', 'Cadeira Abdutora - HardBrave', 16740),
  p('HS17', 'Cadeira Adutora - HardBrave', 16740),
  p('HS32', 'Cadeira Adutora/Abdutora (Dual) - HardBrave', 17460),
  p('HS07', 'Puxada Alta - HardBrave', 16740),
  p('HS08', 'Remada Unilateral a Cabo - HardBrave', 16740),
  // Classic: tudo separado, sem Dual
  p('BH11', 'Cadeira Extensora - ClassicBrave', 23040),
  p('BH12', 'Cadeira Flexora - ClassicBrave', 23040),
  p('BH17', 'Cadeira Abdutora - ClassicBrave', 23040),
  p('BH16', 'Cadeira Adutora - ClassicBrave', 23040),
  // Light: Dual de adutora/abdutora e puxada+remada combinadas
  p('EXT-LT', 'Cadeira Extensora - Linha Light', 12000),
  p('ABD-ADU-LT', 'Cadeira Abdutora/Adutora - Linha Light', 12000),
  p('PUXADAREMADA-LT', 'Puxada Alta e Remada Baixa Single - Linha Light', 12900),
  // Variante unilateral mais barata não pode ser a primária
  p('TM17', 'Cadeira Extensora Unilateral - Hard Plate Loaded', 12240),
  p('TM18', 'Cadeira Extensora - Hard Plate Loaded', 13000),
  // Lixo
  p('PLT', 'Paleteira', 100),
  p('BH08B', 'Puxada Alta Isolada - ClassicBrave', 0),
];
const pedido = lista('extensora, flexora, adutora, abdutora, puxada alta, remada baixa').itens;
const ESTOQUE = { HS32: 1, HS13: 0, BH11: 5 }; // saldos inventados
const res = montarOpcoes(pedido, CATALOGO, ESTOQUE);
const linha = (id) => res.find((r) => r.linha === id);
const skus = (l) => l.itens.map((i) => i.produto.sku).sort();

// Hard: adutora+abdutora viram UMA Dual; extensora/flexora ficam separadas.
assert.deepEqual(skus(linha('hard')), ['HS07', 'HS13', 'HS14', 'HS32']);
assert.equal(linha('hard').itens.find((i) => i.produto.sku === 'HS32').dual, true);
assert.deepEqual(linha('hard').faltando, ['Remada Baixa'], 'remada "unilateral" não é remada baixa');
// Classic: sem Dual, as quatro separadas.
assert.deepEqual(skus(linha('classic')), ['BH11', 'BH12', 'BH16', 'BH17']);
assert.deepEqual(linha('classic').faltando.sort(), ['Puxada Alta', 'Remada Baixa']);
// Light: Dual + combinada cobrindo puxada E remada; flexora não existe na linha.
assert.deepEqual(skus(linha('light')), ['ABD-ADU-LT', 'EXT-LT', 'PUXADAREMADA-LT']);
assert.deepEqual(linha('light').faltando, ['Cadeira Flexora']);
assert.equal(linha('light').cobre, 5, 'puxada e remada contam as duas (6 pedidos - 1 faltando)');
assert.equal(linha('light').de, 6);
// Variante: a "não unilateral" é a primária mesmo custando mais; a outra aparece como variante.
const hpl = linha('hard_pl').itens.find((i) => i.equip === 'extensora');
assert.equal(hpl.produto.sku, 'TM18');
assert.equal(hpl.variantes, 1);
// "remada" genérica aceita outra remada da linha, e o texto avisa que é opção.
{
  const rg = montarOpcoes(lista('remada').itens, CATALOGO, {});
  const it = rg.find((r) => r.linha === 'hard').itens[0];
  assert.equal(it.produto.sku, 'HS08');
  assert.equal(it.trocou, true);
  assert.match(mensagemComparativa(rg), /Remada Unilateral a Cabo - HardBrave \(opção para "Remada Baixa"\)/);
}
// Lixo não entra em linha nenhuma.
assert.ok(!res.some((r) => r.itens.some((i) => ['PLT', 'BH08B'].includes(i.produto.sku))));

// Preço por linha (decisão 10/10/2026): Light 15%/5%, demais 30%/15% sobre o catálogo.
const ext = linha('hard').itens.find((i) => i.produto.sku === 'HS13');
assert.equal(ext.produto.avista, Math.round(16740 * 0.70)); // hard: à vista 30% off
assert.equal(ext.produto.prazo, Math.round(16740 * 0.85));  // hard: a prazo 15% off
assert.equal(linha('hard').total_prazo, Math.round(16740 * 0.85) * 3 + Math.round(17460 * 0.85));
assert.equal(linha('hard').total_avista, Math.round(16740 * 0.70) * 3 + Math.round(17460 * 0.70));
const lgt = linha('light').itens[0];
assert.equal(lgt.produto.avista, Math.round(lgt.produto.preco * 0.85)); // light: à vista 15% off
assert.equal(lgt.produto.prazo, Math.round(lgt.produto.preco * 0.95));  // light: a prazo 5% off

// Estoque: saldo 0 = encomenda, saldo suficiente = pronta, ausente = consultar.
assert.equal(linha('hard').itens.find((i) => i.produto.sku === 'HS13').estoque.status, 'encomenda');
assert.equal(linha('classic').itens.find((i) => i.produto.sku === 'BH11').estoque.status, 'pronta');
assert.equal(linha('classic').itens.find((i) => i.produto.sku === 'BH12').estoque.status, 'consultar');
// Quantidade maior que o saldo: parte pronta, parte encomenda.
{
  const r2 = montarOpcoes(lista('2 adutora, 2 abdutora').itens, CATALOGO, { HS32: 1 });
  const d = r2.find((r) => r.linha === 'hard').itens[0];
  assert.equal(d.qtd, 2);
  assert.deepEqual([d.estoque.status, d.estoque.pronta, d.estoque.encomenda], ['parcial', 1, 1]);
}
// Dual com quantidades diferentes: o que sobra vai separado.
{
  const r3 = montarOpcoes(lista('3 adutora, 1 abdutora').itens, CATALOGO, {});
  const h = r3.find((r) => r.linha === 'hard');
  assert.deepEqual(h.itens.map((i) => [i.produto.sku, i.qtd]).sort(), [['HS17', 2], ['HS32', 1]]);
}
// Ordenação: mais itens cobertos primeiro; empate, o mais barato.
for (let i = 1; i < res.length; i++) {
  assert.ok(res[i - 1].cobre > res[i].cobre
    || (res[i - 1].cobre === res[i].cobre && res[i - 1].total_avista <= res[i].total_avista));
}

// ── 5) Texto ────────────────────────────────────────────────────────────────
const msg = mensagemComparativa(res, { desconhecidos: ['2 esteiras'] });
// Valor literal de propósito: é a regra do Léo (120 dias), não um espelho da constante.
assert.equal(PRAZO_ENCOMENDA_DIAS, 120);
assert.ok(msg.includes('sob encomenda (120 dias)'), 'sob encomenda tem que dizer o prazo');
assert.ok(msg.includes('R$ 11.718 à vista')); // HS13 na hard: 16740 × 0,70 (30% off)
assert.ok(msg.includes('2 esteiras'));
assert.match(msg, /Não tem nesta linha: Remada Baixa/);
assert.match(msg, /\(cobre 5 de 6\)/);
assert.ok(!/hyrox/i.test(msg), 'marca de terceiro');
assert.equal(mensagemComparativa([]).includes('Não encontrei'), true);
// Quantidade aparece como "2x".
assert.match(mensagemComparativa(montarOpcoes(lista('2 extensora').itens, CATALOGO, {})), /• 2x Cadeira Extensora/);

// ── 6) Quais linhas mostrar (decisão do Léo: cabo por padrão, carga só se pedir) ──
{
  const CAT = [
    ...CATALOGO,
    p('TM29', 'Scott Máquina Articulado - Hard Plate Loaded', 11520),
    p('TM09', 'Smith Machine - Hard Plate Loaded', 19080),
    p('BL05', 'Máquina de Bíceps - Plate Loaded Classic', 24120),
    p('F58', 'Hack Press Squat 45º', 17990),
  ];
  const ped = lista('extensora, bíceps, smith');
  const todas = montarOpcoes(ped.itens, CAT, {});
  assert.ok(todas.some((l) => l.familia === 'carga'), 'o catálogo de teste tem linhas de carga');

  const padrao = escolherLinhas(todas, ped.itens, { texto: 'extensora, bíceps, smith' });
  assert.ok(padrao.linhas.length > 0);
  assert.ok(padrao.linhas.every((l) => ['light', 'hard', 'classic', 'tech'].includes(l.linha)),
    'sem pedir, só as quatro linhas de cabo');
  // O que as linhas de cabo não têm vem como complemento, da outra linha, nunca some.
  const rot = padrao.complementos.map((c) => c.rotulo).sort();
  assert.ok(rot.includes('Bíceps'), 'bíceps só existe em Plate Loaded: tem que aparecer como complemento');
  assert.ok(rot.includes('Smith'));
  assert.ok(padrao.complementos.every((c) => c.linhaRotulo), 'complemento diz de que linha é');

  // Pediu "plate": as linhas de carga entram como linha, não como complemento.
  const plate = escolherLinhas(todas, ped.itens, { texto: 'quero as de anilha, plate loaded' });
  assert.ok(plate.linhas.some((l) => l.familia === 'carga'));
  assert.equal(plate.querCarga, true);

  // "todas" mostra tudo, inclusive avulsas.
  const tudo = escolherLinhas(todas, ped.itens, { todas: true });
  assert.equal(tudo.linhas.length, todas.length);

  // Item que não existe em NENHUMA linha vai para naoEncontrados.
  const so = lista('extensora, gravitron');
  const t2 = escolherLinhas(montarOpcoes(so.itens, CAT, {}), so.itens, {});
  assert.deepEqual(t2.naoEncontrados, ['Gravitron']);

  // Nada nas linhas padrão: não devolve vazio, amplia.
  const so2 = lista('bíceps');
  const t3 = escolherLinhas(montarOpcoes(so2.itens, CAT, {}), so2.itens, {});
  assert.equal(t3.ampliado, true);
  assert.ok(t3.linhas.length > 0);

  // O texto traz o bloco de complementos e a hora do estoque.
  const m = mensagemComparativa(padrao.linhas, { complementos: padrao.complementos, estoqueEm: '10/10 15:00' });
  assert.match(m, /\*Também temos, em outra linha:\*/);
  assert.match(m, /Estoque conferido em 10\/10 15:00\./);
}

console.log(`OK — linha pelo nome, ${Object.keys(CATALOGO).length} itens de catálogo fictício, Dual/combinada, estoque e à vista`);
