import renderShare from './_render-share.js';
import renderProposta from './_render-proposta.js';
import renderCombo from './_render-combo.js';

/* ═══════════════════════════════════════════════
   BRAVE HUB — API: Render HTML (função consolidada)
   Uma única função serverless para as páginas renderizadas
   no servidor, roteando por ?tipo= (respeita o limite Hobby).

   GET /api/render?tipo=share&slug=...    → OG/preview do orçamento (rota /proposta/{slug})
   GET /api/render?tipo=pp&slug=...        → proposta premium (rota /pp/{slug})
   GET /api/render?tipo=combo&slug=...     → combo de ergômetros (rota /lp/ergo/{slug})
   GET /api/render?tipo=combo-og&slug=...  → imagem OG dinâmica do combo (/lp/ergo/og/{slug}.png)
   ═══════════════════════════════════════════════ */

export default async function handler(req, res) {
  const tipo = req.query?.tipo;
  if (tipo === 'pp') return renderProposta(req, res);
  if (tipo === 'combo') return renderCombo(req, res);
  if (tipo === 'combo-og') {
    try {
      const { comboImageBuffer } = await import('./_og-combo.js');
      const buf = await comboImageBuffer(req.query.slug || '', req.query.d);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
      return res.status(200).send(buf);
    } catch (e) {
      // fallback: card estático genérico de ergômetros
      res.setHeader('Location', 'https://brave-hub-two.vercel.app/og/ergometros.png');
      return res.status(302).end();
    }
  }
  return renderShare(req, res); // default: /proposta/ (share/OG)
}
