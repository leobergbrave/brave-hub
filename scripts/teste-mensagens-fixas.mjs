// scripts/teste-mensagens-fixas.mjs — trava duas decisões do Léo de 08/10/2026
// sobre as mensagens do painel:
//   1) o TURF de 16,5m x 2m não é mais vendido: não pode aparecer no texto
//      (ele saía e o consultor apagava a linha à mão a cada envio);
//   2) o "Pedir cadastro" não manda mais link: pede os dados na conversa.
// Também confere que a cópia de reserva do userscript não se afasta do servidor
// — o painel instalado usa a reserva quando o HUB ainda não respondeu.
//
// Rodar:  node scripts/teste-mensagens-fixas.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.VITE_SUPABASE_URL ||= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const { mensagemTurf, RAPIDAS } = await import('../api/_fss-produtos.js');

// ── 1) Turf ─────────────────────────────────────────────────────────────────
const lanes = { preco_avista: 3510, preco: 3900 };
const base = { preco_avista: 1690 };
const turf = mensagemTurf(lanes, base);

assert.ok(!/16[,.]5/.test(turf), 'o Turf de 16,5m não pode aparecer na mensagem');
assert.ok(turf.includes('12,5m x 2m (lanes centrais)'), 'a pista de 12,5m tem que continuar');
assert.ok(turf.includes('R$ 3.510 à vista'), 'preço da pista vem do catálogo');
assert.ok(turf.includes('Base do atleta 1,8m x 2m'), 'a base opcional tem que continuar');
// A linha em branco entre os bullets e o preço: era a que sobrava depois de o
// Léo apagar a linha de 16,5m, e some se o separador ficar atrelado a ela.
assert.ok(turf.includes('estação de treino\n\n📏 *12,5m'), 'linha em branco antes do preço');
assert.equal(mensagemTurf.length, 2, 'a função não recebe mais o Turf cheio');

// Só a base (pista fora do catálogo): ainda separa do texto de cima.
assert.ok(mensagemTurf(null, base).includes('estação de treino\n\n➕ Opcional'));
// Sem pista nem base: só a apresentação, sem linha em branco sobrando no fim.
assert.ok(!mensagemTurf(null, null).endsWith('\n'));

// ── 2) Pedir cadastro ───────────────────────────────────────────────────────
const cadastro = RAPIDAS.find((m) => m.id === 'cadastro');
assert.ok(cadastro, 'a mensagem de cadastro existe');
assert.deepEqual(cadastro.texto.split('\n'), [
  'Para gerar seu orçamento personalizado preciso dos seguintes dados:',
  'Empresa/Nome:',
  'CNPJ/CPF:',
  'Endereço:',
  'CEP:',
  'WhatsApp:',
]);
assert.ok(!/https?:|brave-hub|\blink\b/i.test(cadastro.texto), 'não manda mais link de cadastro');

// ── 2b) Dados de pagamento e chave Pix ──────────────────────────────────────
const pagamento = RAPIDAS.find((m) => m.id === 'pagamento');
const pix = RAPIDAS.find((m) => m.id === 'pix');
assert.ok(pagamento && pix, 'as mensagens de pagamento e de Pix existem');

// Todos os dados que o cliente precisa para pagar, como o Léo passou.
for (const dado of ['BTG', '208', '0050', '437636-6', '33167844000180',
  'Brave Fitness Equipamentos', 'comprovante']) {
  assert.ok(pagamento.texto.includes(dado), `faltou "${dado}" nos dados de pagamento`);
}

/* A chave tem que ser a mensagem INTEIRA, em texto puro: o WhatsApp nao tem
   botao "Copiar" em mensagem comum, entao o cliente segura o balao e copia tudo.
   Qualquer marcador de formatacao (*, _, ~, crase) entraria na copia e o app do
   banco recusaria a chave. Espaco ou quebra de linha tambem sujariam a copia. */
assert.equal(pix.texto, 'contato@bravefitness.com.br');
assert.ok(!/[*_~`'"\s]/.test(pix.texto), 'a chave Pix tem que ser texto puro, sem formatação nem espaço');

// A chave dos dados de pagamento e a da mensagem avulsa: nunca podem divergir.
assert.ok(pagamento.texto.includes(`Chave Pix: ${pix.texto}\n`), 'a chave nos dados de pagamento difere da avulsa');
// A chave fica em linha propria nos dados (nao colada ao "Confirmando nome").
assert.ok(pagamento.texto.split('\n').includes(`Chave Pix: ${pix.texto}`));

// Regra de marca (vale para todo texto fixo): HYROX é de terceiro e não pode aparecer.
for (const m of RAPIDAS) {
  assert.ok(!/hyrox/i.test(m.texto), `"${m.id}" cita a marca HYROX`);
}

// ── 3) Userscript: reserva igual ao servidor, sem o fluxo antigo, versão coerente ──
const user = fs.readFileSync(new URL('./fss-enviar-proposta.user.js', import.meta.url), 'utf8');
// Cada texto fixo tem uma reserva no userscript (usada quando o HUB não respondeu):
// toda linha do servidor precisa estar lá, igual. Vale em dobro para o pagamento,
// que o cliente pede justamente num dia de HUB lento.
for (const m of [cadastro, pagamento, pix]) {
  for (const linha of m.texto.split('\n').filter(Boolean)) {
    assert.ok(user.includes(`'${linha}'`), `o userscript perdeu a linha de reserva de "${m.id}": ${linha}`);
  }
  assert.ok(user.includes(`id: '${m.id}'`), `o userscript não tem o botão "${m.id}"`);
}
assert.ok(!user.includes('cadastro_prefill_criar'), 'o userscript não deve mais gerar link de cadastro');
const cabecalho = user.match(/@version\s+(\S+)/)?.[1];
const constante = user.match(/const VERSAO = '([^']+)'/)?.[1];
assert.ok(cabecalho && cabecalho === constante, `versão incoerente: @version ${cabecalho} x VERSAO ${constante}`);

console.log(`OK — Turf sem 16,5m, cadastro sem link, pagamento e Pix (texto puro), reservas iguais (v${constante})`);
