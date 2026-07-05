import renderShare from './_render-share.js';
import renderProposta from './_render-proposta.js';

/* ═══════════════════════════════════════════════
   BRAVE HUB — API: Render HTML (função consolidada)
   Uma única função serverless para as páginas renderizadas
   no servidor, roteando por ?tipo= (respeita o limite Hobby).

   GET /api/render?tipo=share&slug=...  → OG/preview do orçamento (rota /proposta/{slug})
   GET /api/render?tipo=pp&slug=...      → proposta premium (rota /pp/{slug})
   ═══════════════════════════════════════════════ */

export default async function handler(req, res) {
  const tipo = req.query?.tipo;
  if (tipo === 'pp') return renderProposta(req, res);
  return renderShare(req, res); // default: /proposta/ (share/OG)
}
