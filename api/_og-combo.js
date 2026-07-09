// api/_og-combo.js — imagem de prévia (Open Graph) dinâmica do combo de ergômetros.
// Renderiza com @vercel/og (satori) mostrando os produtos escolhidos + total.
import { ImageResponse } from '@vercel/og';
import { parseComboSlug, comboTotais } from '../src/data/ergoCatalog.js';
import { INTER_BLACK_B64, INTER_SEMIBOLD_B64, LOGO_DATA_URI, fontBuffer } from './_og-assets.js';

const DARK = '#050507';
const NEON = '#39ff14';
const MUTED = '#a1a1aa';

const fmtBRL = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

const h = (type, props = {}, ...children) => {
  const style = props.style || {};
  if (type === 'div' && style.display === undefined) style.display = 'flex';
  return { type, props: { ...props, style, children: children.flat().filter(c => c != null) } };
};

export async function comboImageBuffer(slug, desconto) {
  const produtos = parseComboSlug(slug);
  const t = comboTotais(produtos, desconto);
  const nomes = produtos.map(p => p.nome);
  const totalTxt = t.avistaFinal > 0
    ? `${t.temConsultar ? 'A partir de ' : ''}${fmtBRL(t.avistaFinal)} à vista`
    : 'Condições sob consulta';

  const el = h('div', {
    style: {
      width: '1200px', height: '630px', display: 'flex', position: 'relative',
      backgroundColor: DARK,
      backgroundImage: `radial-gradient(1000px 520px at 90% 10%, rgba(57,255,20,0.20), rgba(57,255,20,0) 60%)`,
      fontFamily: 'Inter', padding: '64px', overflow: 'hidden',
    },
  },
    // faixa neon no rodapé
    h('div', { style: { position: 'absolute', left: 0, bottom: 0, width: '1200px', height: '10px', backgroundImage: `linear-gradient(90deg, ${NEON}, rgba(57,255,20,0.15))` } }),
    // coluna esquerda
    h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'space-between', width: '620px' } },
      h('div', { style: { display: 'flex', flexDirection: 'column' } },
        h('img', { src: LOGO_DATA_URI, width: 200, height: 59, style: { objectFit: 'contain' } }),
        h('div', { style: { color: NEON, fontSize: '22px', fontWeight: 600, letterSpacing: '4px', marginTop: '40px', display: 'flex' } }, 'COMBO DE ERGÔMETROS'),
        h('div', { style: { color: '#ffffff', fontSize: '80px', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-3px', marginTop: '8px', display: 'flex' } }, 'MONTE SEU'),
        h('div', { style: { color: NEON, fontSize: '80px', fontWeight: 900, lineHeight: 1.0, letterSpacing: '-3px', display: 'flex' } }, 'BOX DE CARDIO'),
      ),
      h('div', { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '18px' } },
        h('div', { style: { width: '8px', height: '52px', backgroundColor: NEON, borderRadius: '4px', display: 'flex' } }),
        h('div', { style: { display: 'flex', flexDirection: 'column' } },
          h('div', { style: { color: '#ffffff', fontSize: '34px', fontWeight: 900, letterSpacing: '-1px', display: 'flex' } }, totalTxt),
          h('div', { style: { color: MUTED, fontSize: '20px', fontWeight: 600, marginTop: '4px', display: 'flex' } }, `${produtos.length} ${produtos.length === 1 ? 'equipamento selecionado' : 'equipamentos selecionados'} · 10x sem juros`),
        ),
      ),
    ),
    // coluna direita: lista de produtos
    h('div', { style: { display: 'flex', flexDirection: 'column', justifyContent: 'center', flex: 1, paddingLeft: '48px', gap: '18px' } },
      ...nomes.slice(0, 6).map(n => h('div', { style: { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px' } },
        h('div', { style: { width: '16px', height: '16px', borderRadius: '4px', backgroundColor: NEON, display: 'flex' } }),
        h('div', { style: { color: '#ffffff', fontSize: '30px', fontWeight: 700, letterSpacing: '-0.5px', display: 'flex' } }, n),
      )),
    ),
  );

  const img = new ImageResponse(el, {
    width: 1200, height: 630,
    fonts: [
      { name: 'Inter', data: fontBuffer(INTER_SEMIBOLD_B64), weight: 600, style: 'normal' },
      { name: 'Inter', data: fontBuffer(INTER_BLACK_B64), weight: 900, style: 'normal' },
      { name: 'Inter', data: fontBuffer(INTER_BLACK_B64), weight: 700, style: 'normal' },
    ],
  });
  return Buffer.from(await img.arrayBuffer());
}
