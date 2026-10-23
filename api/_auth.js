// api/_auth.js — trava das rotas de envio do ADMIN (as que mandam WhatsApp pelo
// número ao vivo). O admin do HUB NÃO tem login (usa a anon key do Supabase
// direto), então não dá pra validar sessão. Em vez disso, o admin guarda um
// TOKEN no navegador (localStorage, o Léo digita uma vez) e manda no header
// x-admin-token. Reusamos o HUB_PANEL_TOKEN (mesmo do painel/userscript) — não
// vai no build (repo e site públicos).
//
// Uso:
//   import { verificarAdmin } from './_auth.js';
//   if (!verificarAdmin(req)) return res.status(401).json({ ok: false, error: 'Token do admin inválido ou ausente.' });
//
// FAIL CLOSED: sem HUB_PANEL_TOKEN setado na Vercel, ninguém passa.

export function verificarAdmin(req) {
  const esperado = process.env.HUB_PANEL_TOKEN || '';
  if (!esperado) return false;
  const t = String(req.headers['x-admin-token'] || '').trim();
  return !!t && t === esperado;
}
