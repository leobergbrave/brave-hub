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
    const { produtos, nome, telefone, estado, cidade } = req.body;

    if (!produtos) {
      return res.status(400).json({ error: 'Campo "produtos" é obrigatório' });
    }

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Gerar código curto único (6 chars)
    const codigo = Math.random().toString(36).substring(2, 8);

    const { error } = await supabase.from('links_rapidos').insert({
      codigo,
      produtos_texto: typeof produtos === 'string' ? produtos : JSON.stringify(produtos),
      nome_lead: nome || '',
      telefone_lead: telefone || null,
      estado_lead: estado || null,
      cidade_lead: cidade || null,
    });

    if (error) throw error;

    // Avança o lead e vincula ao link rápido
    if (telefone) {
      const tel = telefone.replace(/\D/g, '');
      const telComDDI = tel.startsWith('55') ? tel : `55${tel}`;
      const telSemDDI = tel.startsWith('55') ? tel.slice(2) : tel;
      const orFilter = `telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI}`;

      await supabase
        .from('leads')
        .update({ status: 'orcamento_gerado' })
        .or(orFilter)
        .in('status', ['novo', 'fluxo_disparado', 'respondeu']);

      // Vincula o código do link ao lead (se ainda não tiver vínculo)
      await supabase
        .from('leads')
        .update({ link_rapido_codigo: codigo })
        .or(orFilter)
        .is('link_rapido_codigo', null);
    }

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
