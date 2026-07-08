// tools/gen-lp-shells.mjs  (postbuild)
// O robô do WhatsApp/Instagram/Telegram NÃO roda JavaScript — só lê o HTML
// estático. Como as LPs são rotas do React (SPA), todas herdariam as tags
// genéricas do index.html. Este script cria, após o `vite build`, um "casco"
// HTML por LP em dist/lp/<slug>/index.html com as tags Open Graph próprias
// (og:image = card premium em /og/<slug>.png). O mesmo bundle React é
// carregado, então a página continua funcionando normal para humanos.
// Custo: ZERO funções serverless (é arquivo estático).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DIST = join(ROOT, 'dist');

const BASE = 'https://brave-hub-two.vercel.app';

const LPS = [
  {
    slug: 'ergometros',
    title: 'Ergômetros Profissionais para o seu Box | BRAVE',
    desc: 'Esteira Curva, Remo, Bike Erg, Air Ski e Escada — pronta entrega, a partir de 10x de R$699. Padrão de performance da BRAVE.',
  },
  {
    slug: 'box-hibrido',
    title: 'Box Híbrido Full | BRAVE',
    desc: 'Montamos o box híbrido ideal para o seu espaço: Sled, Turf, Kettlebells Oficiais e Bags. A primeira marca híbrida do Brasil.',
  },
  {
    slug: 'hyrox',
    title: 'Torne seu Box Referência HYROX | BRAVE',
    desc: 'Equipamentos no padrão das competições HYROX oficiais. Seja pioneiro na sua cidade com as 8 estações da modalidade.',
  },
  {
    slug: 'crossfit',
    title: 'Equipe seu Box de CrossFit | BRAVE',
    desc: 'Barras olímpicas, anilhas, racks, rigs, fundições e acessórios. Fabricante com fundição própria — monte seu box de CrossFit completo com qualidade de competição.',
  },
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function ogBlock({ slug, title, desc }) {
  const url = `${BASE}/lp/${slug}`;
  const img = `${BASE}/og/${slug}.png`;
  return `    <title>${esc(title)}</title>
    <meta name="description" content="${esc(desc)}" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Brave" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:image" content="${img}" />
    <meta property="og:image:secure_url" content="${img}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(title)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(title)}" />
    <meta name="twitter:description" content="${esc(desc)}" />
    <meta name="twitter:image" content="${img}" />`;
}

// remove as tags genéricas do index.html (title, description, og:*, twitter:*)
function stripGeneric(html) {
  return html
    .replace(/[ \t]*<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/[ \t]*<meta\s+name="description"[^>]*>\s*/i, '')
    .replace(/[ \t]*<meta\s+property="og:[^"]*"[^>]*>\s*/gi, '')
    .replace(/[ \t]*<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi, '');
}

function main() {
  const indexHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
  for (const lp of LPS) {
    let html = stripGeneric(indexHtml);
    html = html.replace(/<\/head>/i, `${ogBlock(lp)}\n  </head>`);
    const dir = join(DIST, 'lp', lp.slug);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
    console.log(`✓ dist/lp/${lp.slug}/index.html`);
  }
  console.log('Cascos Open Graph das LPs gerados.');
}

main();
