// tools/gen-og-cards.mjs
// Gera as imagens de prévia (Open Graph, 1200x630) das landing pages.
// Texto nítido via satori (converte texto em vetor) + sharp (SVG -> PNG).
// Rode local: `node tools/gen-og-cards.mjs`. Os PNGs vão para /public/og e
// são commitados (não dependem do build da Vercel nem de créditos de IA).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import satori from 'satori';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// ── Marca ────────────────────────────────────────────────────────────────
const DARK = '#050507';
const NEON = '#39ff14';
const MUTED = '#a1a1aa';

const fontsDir = join(__dirname, 'fonts');
const font = (file, weight) => ({
  name: 'Inter',
  data: readFileSync(join(fontsDir, file)),
  weight,
  style: 'normal',
});
const fonts = [
  font('Inter-Black.woff', 900),
  font('Inter-Bold.woff', 700),
  font('Inter-SemiBold.woff', 600),
  font('Inter-Regular.woff', 400),
];

const logoData =
  'data:image/png;base64,' +
  readFileSync(join(ROOT, 'public', 'logo-lp.png')).toString('base64');

// ── Conteúdo por landing page ──────────────────────────────────────────────
const CARDS = [
  {
    slug: 'ergometros',
    badge: 'PRONTA ENTREGA',
    eyebrow: 'EQUIPAMENTOS DE ALTA PERFORMANCE',
    h1: 'ERGÔMETROS',
    h2: 'PARA O SEU BOX',
    trigger: 'A partir de 10x de R$699',
    sub: 'Esteira Curva · Remo · Bike Erg · Air Ski · Escada',
  },
  {
    slug: 'box-hibrido',
    badge: 'CORRIDA HÍBRIDA',
    eyebrow: 'A PRIMEIRA MARCA HÍBRIDA DO BRASIL',
    h1: 'BOX HÍBRIDO',
    h2: 'FULL',
    trigger: 'Montamos o box ideal para o seu espaço',
    sub: 'Sled 15m · Turf · Kettlebells Oficiais · Bags',
  },
  {
    slug: 'hyrox',
    badge: 'EQUIPAMENTOS OFICIAIS',
    eyebrow: 'PADRÃO DAS COMPETIÇÕES HYROX',
    h1: 'TORNE SEU BOX',
    h2: 'REFERÊNCIA HYROX',
    trigger: 'Seja pioneiro na sua cidade',
    sub: 'As 8 estações no padrão das provas oficiais',
  },
  {
    slug: 'crossfit',
    badge: 'LINHA COMPLETA',
    eyebrow: 'FABRICANTE · FUNDIÇÃO PRÓPRIA',
    h1: 'EQUIPE SEU BOX',
    h2: 'DE CROSSFIT',
    trigger: 'Barras · Anilhas · Racks · Rigs',
    sub: 'Padrão de competição e o melhor custo-benefício',
  },
  {
    slug: 'brave',
    badge: 'ALTA PERFORMANCE',
    eyebrow: 'EQUIPAMENTOS PARA BOX E STUDIOS',
    h1: 'EQUIPE SEU BOX',
    h2: 'COM A BRAVE',
    trigger: 'Ergômetros · Corrida Híbrida · HYROX',
    sub: 'Orçamento exclusivo · Pronta entrega',
  },
];

// hyperscript helper (sem JSX). satori exige display:flex em todo div — injeta por padrão.
const h = (type, props = {}, ...children) => {
  const style = props.style || {};
  if (type === 'div' && style.display === undefined) style.display = 'flex';
  return {
    type,
    props: { ...props, style, children: children.flat().filter((c) => c !== null && c !== undefined) },
  };
};

function card(c) {
  return h(
    'div',
    {
      style: {
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        backgroundColor: DARK,
        backgroundImage: `radial-gradient(1000px 520px at 88% 12%, rgba(57,255,20,0.20), rgba(57,255,20,0) 60%)`,
        fontFamily: 'Inter',
        padding: '68px 72px',
        overflow: 'hidden',
      },
    },
    // faixa neon no rodapé
    h('div', {
      style: {
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: '1200px',
        height: '10px',
        backgroundImage: `linear-gradient(90deg, ${NEON}, rgba(57,255,20,0.15))`,
      },
    }),
    // brilho geométrico lateral
    h('div', {
      style: {
        position: 'absolute',
        right: '-160px',
        top: '-160px',
        width: '520px',
        height: '520px',
        borderRadius: '80px',
        border: `2px solid rgba(57,255,20,0.18)`,
        transform: 'rotate(45deg)',
        display: 'flex',
      },
    }),

    // ── topo: logo + selo ──
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } },
      h('img', { src: logoData, width: 210, height: 62, style: { objectFit: 'contain' } }),
      h(
        'div',
        {
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            backgroundColor: 'rgba(57,255,20,0.10)',
            border: `1.5px solid rgba(57,255,20,0.55)`,
            color: NEON,
            fontSize: '20px',
            fontWeight: 700,
            letterSpacing: '2px',
            padding: '12px 22px',
            borderRadius: '999px',
          },
        },
        h('div', { style: { width: '12px', height: '12px', borderRadius: '999px', backgroundColor: NEON, display: 'flex' } }),
        c.badge,
      ),
    ),

    // ── meio: eyebrow + headline ──
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'column' } },
      h(
        'div',
        { style: { color: NEON, fontSize: '24px', fontWeight: 700, letterSpacing: '4px', marginBottom: '18px', display: 'flex' } },
        c.eyebrow,
      ),
      h(
        'div',
        { style: { color: '#ffffff', fontSize: '96px', fontWeight: 900, lineHeight: 0.98, letterSpacing: '-3px', display: 'flex' } },
        c.h1,
      ),
      h(
        'div',
        { style: { color: NEON, fontSize: '96px', fontWeight: 900, lineHeight: 0.98, letterSpacing: '-3px', display: 'flex' } },
        c.h2,
      ),
    ),

    // ── base: gatilho ──
    h(
      'div',
      { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '22px' } },
      h('div', { style: { width: '8px', height: '58px', backgroundColor: NEON, borderRadius: '4px', display: 'flex' } }),
      h(
        'div',
        { style: { display: 'flex', flexDirection: 'column' } },
        h('div', { style: { color: '#ffffff', fontSize: '34px', fontWeight: 800, letterSpacing: '-1px', display: 'flex' } }, c.trigger),
        h('div', { style: { color: MUTED, fontSize: '22px', fontWeight: 500, marginTop: '6px', display: 'flex' } }, c.sub),
      ),
    ),
  );
}

async function main() {
  for (const c of CARDS) {
    const svg = await satori(card(c), { width: 1200, height: 630, fonts });
    const out = join(ROOT, 'public', 'og', `${c.slug}.png`);
    await sharp(Buffer.from(svg)).png().toFile(out);
    console.log(`✓ ${c.slug}.png`);
  }
  console.log('OG cards gerados em public/og/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
