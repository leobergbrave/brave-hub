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
const {
  mensagemTurf, RAPIDAS, mensagemBarras, linhasDePeso, VIDEO_BARRAS_EVOBLACK,
  videoDeLinha, IDS_COM_VIDEO_DE_LINHA, mensagemPiso,
} = await import('../api/_fss-produtos.js');

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
  'E-mail:',
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

// ── 2c) Barras EvoBlack 8.0 (BLACK10 / BLACK15 / BLACK20) ───────────────────
// Catálogo FICTÍCIO com os nomes e preços reais do cadastro.
const barras = [
  { codigo_sku: 'BLACK20', nome: 'Barra Masculina 20kg - EVOBlack 8.0 - Rolamentos agulha', preco: 1699 },
  { codigo_sku: 'BLACK10', nome: 'Barra Olimpica 10kg - Iniciante - EvoBlack 8.0', preco: 1199 },
  { codigo_sku: 'BLACK15', nome: 'Barra Feminina 15kg - EVOBlack 8.0 - Rolamentos agulha', preco: 1599 },
];
const msgBarras = mensagemBarras(barras);
const linhasB = msgBarras.split('\n').filter((l) => /^\*\d+KG\*/.test(l));

assert.equal(linhasB.length, 3, 'uma linha por modelo');
// Ordem pelo peso, mesmo com o catálogo vindo embaralhado, e cada modelo no seu peso.
assert.match(linhasB[0], /^\*10KG\* Iniciante — .*R\$ 1\.079 à vista.*10x de R\$ 119,90/);
assert.match(linhasB[1], /^\*15KG\* Feminina — .*R\$ 1\.439 à vista.*10x de R\$ 159,90/);
assert.match(linhasB[2], /^\*20KG\* Masculina — .*R\$ 1\.529 à vista.*10x de R\$ 169,90/);

// Só afirma o que as LPs (crossfit-box) dizem das TRÊS barras. Garantia, "aço testado
// até 210.000 psi" e recartilho para LPO aparecem só em parte delas na LP.
assert.ok(msgBarras.includes('Rolamento agulha'));
assert.ok(msgBarras.includes('Black Chrome'));
for (const semFonte of [/garantia/i, /210\.?000/, /psi/i, /recartilho/i, /IWF/i]) {
  assert.ok(!semFonte.test(msgBarras), `afirmação sem fonte para as três barras: ${semFonte}`);
}
assert.ok(!/hyrox/i.test(msgBarras), 'marca de terceiro');

// O vídeo é do bucket, na pasta das linhas, e em .mp4 (formato que a BotConversa aceita).
assert.match(VIDEO_BARRAS_EVOBLACK, /\/storage\/v1\/object\/public\/produtos_media\/linhas\/linha-barras-evoblack-8\.mp4$/);

// Regressão: o parâmetro novo de linhasDePeso não pode mexer no que já está no ar.
assert.deepEqual(linhasDePeso([{ nome: 'Med Ball 08LB - Verde', preco: 419 }], true),
  ['*8LB* Verde — 💰 *R$ 377 à vista* ou 10x de R$ 41,90 sem juros']);
assert.deepEqual(linhasDePeso([{ nome: 'Dumbbell Sextavado Iron 22,5KG', preco: 360 }], false),
  ['*22,5KG* — 💰 *R$ 324 à vista* ou 10x de R$ 36 sem juros']);

// ── 2d) Vídeos montados das fotos (itens que não tinham vídeo) ────────────────
// Os 12 itens detectados em 10/10/2026 como "sem vídeo". Lista fixa de propósito:
// se um id sumir ou entrar sem querer, o teste avisa.
const SEM_VIDEO_EM_10_10 = ['corda', 'medballpro', 'medballcor', 'kbiron', 'kbtex', 'kbhib',
  'bumperblack', 'bumpercollor', 'dbiron', 'dbevo', 'dbhybrid', 'sandbag',
  'piso']; // + piso (P1M), acrescentado em 12/10/2026
assert.deepEqual([...IDS_COM_VIDEO_DE_LINHA].sort(), [...SEM_VIDEO_EM_10_10].sort());
assert.equal(new Set(IDS_COM_VIDEO_DE_LINHA).size, IDS_COM_VIDEO_DE_LINHA.length, 'id repetido');

for (const id of IDS_COM_VIDEO_DE_LINHA) {
  assert.match(videoDeLinha(id),
    new RegExp(`/storage/v1/object/public/produtos_media/linhas/video-${id}\\.mp4$`), `url do vídeo de ${id}`);
}
// Quem tem vídeo PRÓPRIO no catálogo (esteira, remo...) ou não está na lista não ganha o de linha.
for (const id of ['esteira', 'escada', 'remo', 'skierg', 'bikeerg', 'storm', 'sledimp', 'slednac', 'turf', 'grama', 'barras', 'xyz']) {
  assert.equal(videoDeLinha(id), '', `"${id}" não deveria ganhar vídeo de linha`);
}

// ── 2e) Piso de borracha P1M ────────────────────────────────────────────────
const msgPiso = mensagemPiso({ codigo_sku: 'P1M', preco: 105 });
assert.ok(msgPiso.includes('100x100'), 'dimensão da placa');
assert.ok(msgPiso.includes('15mm'), 'espessura');
// Preço: catálogo é o a prazo; à vista = preço x 0,90 em reais inteiros.
assert.ok(msgPiso.includes('R$ 95 à vista'), 'à vista = round(105 x 0,9)');
assert.ok(msgPiso.includes('10x de R$ 10,50 sem juros'));
// Só o que a LP crossfit-box afirma do piso: nada de garantia, densidade ou norma.
for (const semFonte of [/garantia/i, /densidade/i, /norma/i, /antiderrapante/i, /kg\/m/i]) {
  assert.ok(!semFonte.test(msgPiso), `afirmação sem fonte no piso: ${semFonte}`);
}
assert.ok(!/hyrox/i.test(msgPiso), 'marca de terceiro');
assert.ok(msgPiso.includes('Outras cores e espessuras sob consulta'));

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
