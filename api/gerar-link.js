import { createClient } from '@supabase/supabase-js';

/* ═══════════════════════════════════════════════
   BRAVE HUB — API: Gerar Link Rápido
   POST /api/gerar-link
   
   Recebe produtos (texto livre) + nome,
   salva no banco e retorna um link curto limpo
   sem espaços, sem caracteres especiais.
   ═══════════════════════════════════════════════ */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { produtos, nome, telefone } = req.body;

    if (!produtos) {
      return res.status(400).json({ error: 'Campo "produtos" é obrigatório' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Gerar código curto único (6 chars)
    const codigo = Math.random().toString(36).substring(2, 8);

    const { error } = await supabase.from('links_rapidos').insert({
      codigo,
      produtos_texto: typeof produtos === 'string' ? produtos : JSON.stringify(produtos),
      nome_lead: nome || '',
      telefone_lead: telefone || null,
    });

    if (error) throw error;

    const baseUrl = req.headers['x-forwarded-host']
      ? `https://${req.headers['x-forwarded-host']}`
      : `https://${req.headers.host || 'brave-hub-two.vercel.app'}`;

    const link = `${baseUrl}/q/${codigo}`;

    return res.status(200).json({ sucesso: true, link, codigo });
  } catch (err) {
    console.error('Erro gerar-link:', err);
    return res.status(500).json({ error: err.message });
  }
}
