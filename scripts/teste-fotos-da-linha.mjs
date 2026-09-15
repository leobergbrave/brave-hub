// scripts/teste-fotos-da-linha.mjs — trava a escolha de foto das linhas de catálogo.
//
// Bug latente achado em 15/09/2026: o painel pegava as 2 primeiras fotos na
// ordem em que o banco devolvia (não garantida) filtrando só com Boolean. O
// catálogo tem o marcador de texto 'SEM_FOTO_BLING' no lugar da foto (KBO12,
// M4L) — e texto passa num filtro Boolean. No dia em que o banco devolvesse um
// deles primeiro, o marcador iria para a BotConversa como mídia, ela recusaria,
// e o envio abortaria ANTES do texto com os preços. O cliente não receberia nada.
//
// Rodar:  node scripts/teste-fotos-da-linha.mjs
import assert from 'node:assert/strict';

process.env.VITE_SUPABASE_URL ||= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const { fotosDaLinha } = await import('../api/_fss-produtos.js');

const foto = (n) => `https://jisbvqrnnujqgbsfondy.supabase.co/storage/v1/object/public/produtos_media/${n}`;

// 1) A armadilha real: o marcador vem PRIMEIRO. Tem que ser pulado.
const texturizado = [
  { codigo_sku: 'KBO12', nome: 'Kettlebell Oficial Texturizado 12kg', url_imagem: 'SEM_FOTO_BLING' },
  { codigo_sku: 'KBO18', nome: 'Kettlebell Oficial Texturizado 18kg', url_imagem: foto('kbo18.png') },
  { codigo_sku: 'KBO10', nome: 'Kettlebell Oficial Texturizado 10kg', url_imagem: foto('kbo10.jpg') },
];
for (const f of fotosDaLinha(texturizado, 2)) {
  assert.match(f, /^https:\/\//, `saiu algo que não é link: ${f}`);
}
assert.ok(!fotosDaLinha(texturizado, 2).includes('SEM_FOTO_BLING'), 'o marcador vazou como foto');

// 2) Nulo, vazio, espaço, marcador em minúsculo e Google Drive também são lixo.
//    (Drive bloqueia o download da BotConversa — regra que já existia em primeiraFoto.)
const lixo = [
  { codigo_sku: 'A1', nome: 'X 1kg', url_imagem: null },
  { codigo_sku: 'A2', nome: 'X 2kg', url_imagem: '' },
  { codigo_sku: 'A3', nome: 'X 3kg', url_imagem: '   ' },
  { codigo_sku: 'A4', nome: 'X 4kg', url_imagem: 'sem_foto_bling' },
  { codigo_sku: 'A5', nome: 'X 5kg', url_imagem: 'https://drive.google.com/file/d/abc/view' },
];
assert.deepEqual(fotosDaLinha(lixo, 2), [], 'linha sem foto válida deveria dar lista vazia');

// 3) Kettlebell manda UMA foto (pedido do Léo em 15/09 — as duas eram iguais).
assert.equal(fotosDaLinha(texturizado, 1).length, 1);

// 4) Sempre a MESMA foto, qualquer que seja a ordem do banco: a do peso mais leve
//    com foto válida. Embaralhar a entrada não pode mudar a saída.
const esperado = fotosDaLinha(texturizado, 1);
assert.deepEqual(esperado, [foto('kbo10.jpg')], 'deveria escolher o peso mais leve com foto válida (10kg)');
for (let i = 0; i < 20; i++) {
  const embaralhado = texturizado.slice().sort(() => Math.random() - 0.5);
  assert.deepEqual(fotosDaLinha(embaralhado, 1), esperado, 'a foto escolhida mudou com a ordem do banco');
}

// 5) A mesma URL repetida em pesos diferentes conta uma vez só.
const repetida = [
  { codigo_sku: 'KB8', nome: 'Kettlebell Iron 08kg', url_imagem: foto('kb8.png') },
  { codigo_sku: 'KB16', nome: 'Kettlebell Iron 16kg', url_imagem: foto('kb8.png') },
  { codigo_sku: 'KB24', nome: 'Kettlebell Iron 24kg', url_imagem: foto('kb24.png') },
];
assert.deepEqual(fotosDaLinha(repetida, 2), [foto('kb8.png'), foto('kb24.png')]);

// 6) Linha vazia não quebra.
assert.deepEqual(fotosDaLinha([], 1), []);
assert.deepEqual(fotosDaLinha(undefined, 1), []);

console.log('OK — marcador, lixo, quantidade, determinismo e repetição cobertos');
