// api/_cadastro-prefill.js — link de cadastro pre-preenchido.
// O painel do FSS le nome/telefone/e-mail da tela do contato e cria um token;
// a pagina /cadastro?p=<token> busca os dados e preenche o formulario, sobrando
// so CPF e endereco para o cliente. Os dados NAO vao na URL (ficariam em logs
// e historico): vivem num JSON do bucket privado, achavel apenas pelo token.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const BUCKET = 'propostas-pdf'; // bucket privado ja existente — nada de migration
const PASTA = 'cadastro-prefill';
const HUB = 'https://brave-hub-two.vercel.app';

export async function criarPrefill(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const b = req.body || {};
    const dados = {
      nome: String(b.nome || '').trim().slice(0, 120),
      telefone: String(b.telefone || '').replace(/\D/g, '').slice(0, 13),
      email: String(b.email || '').trim().slice(0, 120),
    };
    if (!dados.nome && !dados.telefone && !dados.email) {
      return res.status(400).json({ ok: false, error: 'Nenhum dado para pré-preencher.' });
    }
    const token = crypto.randomBytes(6).toString('base64url');
    const up = await supabaseAdmin.storage.from(BUCKET)
      .upload(`${PASTA}/${token}.json`, Buffer.from(JSON.stringify(dados)), { contentType: 'application/json' });
    if (up.error) throw new Error(up.error.message);
    return res.status(200).json({ ok: true, token, url: `${HUB}/cadastro?p=${token}` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}

export async function lerPrefill(req, res) {
  const token = String(req.query?.p || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24);
  if (!token) return res.status(400).json({ ok: false, error: 'token ausente' });
  const dl = await supabaseAdmin.storage.from(BUCKET).download(`${PASTA}/${token}.json`);
  if (dl.error) return res.status(404).json({ ok: false });
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, dados: JSON.parse(await dl.data.text()) });
}
