// scripts/teste-rotulo-peso.mjs — trava o rotulo de peso das listas de produto.
//
// Bug achado em 18/09/2026, ao incluir os dumbbells: a regex era /(\d+)\s*(KG|LB)/
// e nao previa peso quebrado. Em "Iron 22,5KG" ela casava so o "5KG" — e como a
// linha tem 7,5 / 12,5 / 17,5 / 22,5, a mensagem sairia com QUATRO linhas "5KG",
// cada uma com um preco diferente. Nenhum produto anterior tinha peso quebrado,
// por isso nunca apareceu.
//
// Rodar:  node scripts/teste-rotulo-peso.mjs
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL ||= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const { rotuloPeso, pesoEmKg } = await import('../api/_fss-produtos.js');

// 1) O caso que quebrava: cada peso quebrado tem que sair diferente do outro.
const quebrados = [
  ['Dumbbell Sextavado Iron 7,5KG', '7,5KG'],
  ['Dumbbell EVO Cromado Vulcanizado 12,5kg', '12,5KG'],
  ['Dumbbell EVO Cromado Vulcanizado 17,5kg', '17,5KG'],
  ['Dumbbell - Hybrid Black - 22,5KG', '22,5KG'],
  ['Dumbbell EVO Cromado Vulcanizado 32,5kg', '32,5KG'],
];
for (const [nome, esperado] of quebrados) {
  assert.equal(rotuloPeso(nome), esperado, `rotulo errado para ${nome}`);
}
const rotulos = quebrados.map(([n]) => rotuloPeso(n));
assert.equal(new Set(rotulos).size, rotulos.length, 'dois pesos diferentes com o mesmo rotulo');

// 2) Peso inteiro nao pode ganhar casa decimal (nao regride o que ja esta no ar).
const inteiros = [
  ['Dumbbell Sextavado Iron 20KG', '20KG'],
  ['Dumbbell Sextavado Iron 1KG', '1KG'],
  ['Kettlebell Iron 04kg', '4KG'],
  ['Kettlebell Oficial Texturizado 4kg', '4KG'],
  ['Med Ball 08LB - Verde', '8LB'],
  ['Medicine Ball 30LB - Pro Series', '30LB'],
  ['Anilha Black Bumper 2.0 - 05kg', '5KG'],
  ['Anilha Collor Bumper 2.0 - 25kg Vermelha', '25KG'],
];
for (const [nome, esperado] of inteiros) {
  assert.equal(rotuloPeso(nome), esperado, `rotulo errado para ${nome}`);
}

/* 3) O "2.0" do nome da anilha NAO pode virar peso: ele vem antes do peso real
      e nao e seguido de kg/lb. Se virasse, a anilha de 25kg sairia como "2KG". */
assert.equal(rotuloPeso('Anilha Collor Bumper 2.0 - 20kg Azul'), '20KG');

// 4) A ORDENACAO usa pesoEmKg e tambem precisa entender peso quebrado, senao
//    7,5kg cairia depois de 30kg na lista.
const ordem = ['Iron 22,5KG', 'Iron 7,5KG', 'Iron 30KG', 'Iron 1KG']
  .sort((a, b) => pesoEmKg(a) - pesoEmKg(b));
assert.deepEqual(ordem, ['Iron 1KG', 'Iron 7,5KG', 'Iron 22,5KG', 'Iron 30KG']);

// 5) Sem peso no nome, devolve o nome — nao inventa rotulo.
assert.equal(rotuloPeso('Produto sem peso'), 'Produto sem peso');

console.log('OK — peso quebrado, inteiro, ordenacao e nome sem peso cobertos');
