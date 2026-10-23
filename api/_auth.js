// api/_auth.js — verifica a sessão de ADMIN (login Supabase) nas rotas sensíveis
// do HUB (as que mandam WhatsApp pelo número ao vivo). O front do admin já loga
// via Supabase Auth e tem um access_token; aqui validamos esse token no servidor.
//
// Uso:
//   import { verificarAdmin } from './_auth.js';
//   const admin = await verificarAdmin(req);
//   if (!admin) return res.status(401).json({ ok: false, error: 'Precisa estar logado no admin.' });
//
// Opcional: defina ADMIN_EMAILS (lista separada por vírgula) na Vercel para
// restringir a e-mails específicos; sem isso, qualquer sessão Supabase válida passa.
import { createClient } from '@supabase/supabase-js';

const SUPA_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPA_ANON = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

function emailsPermitidos() {
  return String(process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function verificarAdmin(req) {
  try {
    const h = req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = String(h).replace(/^Bearer\s+/i, '').trim();
    // Sem token, ou token = a própria anon key (front não logado manda ela no fallback): barra.
    if (!token || token === SUPA_ANON) return null;
    if (!SUPA_URL || !SUPA_ANON) return null;

    const supa = createClient(SUPA_URL, SUPA_ANON);
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data?.user) return null;

    const permitidos = emailsPermitidos();
    if (permitidos.length > 0) {
      const email = String(data.user.email || '').toLowerCase();
      if (!permitidos.includes(email)) return null;
    }
    return data.user;
  } catch (_) {
    return null;
  }
}
