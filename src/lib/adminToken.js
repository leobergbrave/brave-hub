// src/lib/adminToken.js — token do painel admin, guardado no navegador.
// O admin do HUB não tem login, e as rotas de envio (Entrada Rápida, Disparos)
// exigem um token no header x-admin-token. O Léo digita uma vez (o mesmo
// HUB_PANEL_TOKEN da Vercel) e fica no localStorage deste navegador.

const KEY = 'HUB_ADMIN_TOKEN';

export function getAdminToken() {
  try { return localStorage.getItem(KEY) || ''; } catch { return ''; }
}

// Retorna o token; se não houver, pede uma vez e guarda.
export function ensureAdminToken() {
  let t = getAdminToken();
  if (!t) {
    try {
      t = (window.prompt('Cole o token do painel (é o HUB_PANEL_TOKEN da Vercel):') || '').trim();
      if (t) localStorage.setItem(KEY, t);
    } catch { /* sem prompt/localStorage */ }
  }
  return t;
}

// Apaga o token guardado (ex.: deu 401, pra pedir de novo no próximo uso).
export function clearAdminToken() {
  try { localStorage.removeItem(KEY); } catch { /* ok */ }
}
