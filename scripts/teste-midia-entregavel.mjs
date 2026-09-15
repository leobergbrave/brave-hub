// scripts/teste-midia-entregavel.mjs — trava a correção das fotos que não chegavam.
//
// Diagnóstico de 15/09/2026, com envios reais para o WhatsApp do Léo:
//   A) PNG original do Iron .............. não chegou
//   B) mesmo PNG sem metadado ............ não chegou
//   C) PNG do Texturizado (controle) ..... não chegou
//   D) mesmos pixels do Iron, em JPEG .... CHEGOU
// A BotConversa aceita PNG com transparência (HTTP 200), mas o WhatsApp não
// entrega — e ninguém avisa. Este teste garante que o que sai para a
// BotConversa é o que funcionou no teste D.
//
// Rodar:  node scripts/teste-midia-entregavel.mjs <caminho-de-um-png-rgba>
import fs from 'node:fs';
import assert from 'node:assert/strict';
import sharp from 'sharp';

process.env.VITE_SUPABASE_URL ||= 'https://x.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'x';
const { pngParaJpeg, precisaConverter } = await import('../api/_fss-produtos.js');

const caminho = process.argv[2];
assert.ok(caminho && fs.existsSync(caminho), 'passe o caminho de um PNG RGBA real');

// 1) Só PNG é convertido — vídeo, JPEG, áudio e PDF já chegam e não podem mudar.
assert.equal(precisaConverter('https://h/x/bling_kb12_1.png'), true);
assert.equal(precisaConverter('https://h/x/bling_kb12_1.PNG?token=abc'), true);
for (const u of ['https://h/a.jpg', 'https://h/a.jpeg', 'https://h/v.mp4', 'https://h/s.mp3', 'https://h/p.pdf']) {
  assert.equal(precisaConverter(u), false, `não deveria converter ${u}`);
}

// 2) A premissa: a entrada é mesmo o caso que falhava (PNG com transparência).
const entrada = fs.readFileSync(caminho);
const meta0 = await sharp(entrada).metadata();
assert.equal(meta0.format, 'png');
assert.equal(meta0.hasAlpha, true, 'o teste precisa de um PNG COM transparência — o caso que falhava');

// 3) A saída é o que funcionou no teste D: JPEG, sem canal de transparência,
//    mesmas dimensões (não pode cortar nem distorcer a foto do produto).
const saida = await pngParaJpeg(entrada);
assert.equal(saida[0], 0xff); assert.equal(saida[1], 0xd8, 'saída não começa com a assinatura JPEG');
const meta1 = await sharp(saida).metadata();
assert.equal(meta1.format, 'jpeg');
assert.equal(meta1.hasAlpha, false, 'JPEG ainda com transparência — é justamente o que não chega');
assert.equal(meta1.channels, 3);
assert.equal(meta1.width, meta0.width);
assert.equal(meta1.height, meta0.height);

// 4) Transparência vira BRANCO, não preto. Sem o flatten, as áreas
//    transparentes saem pretas — o produto apareceria num quadro preto, pior
//    do que não mandar foto.
//    Usa imagem SINTÉTICA de propósito: as fotos reais do catálogo têm o canal
//    de transparência mas 100% opaco (0% de pixels transparentes, medido em
//    15/09). Testar só com elas fazia esta verificação passar sem rodar.
const transparente = await sharp({
  create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).png().toBuffer();
const achatado = await pngParaJpeg(transparente);
const { data: px } = await sharp(achatado).raw().toBuffer({ resolveWithObject: true });
assert.ok(px[0] > 240 && px[1] > 240 && px[2] > 240,
  `pixel transparente virou rgb(${px[0]},${px[1]},${px[2]}) em vez de branco`);

console.log(`OK — ${meta0.width}x${meta0.height} PNG RGBA -> JPEG 3 canais (${entrada.length} -> ${saida.length} bytes)`);
