import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar configurações de chaves com segurança no Supabase
    const { data: config, error: configError } = await supabase
      .from('prospeccao_config')
      .select('apify_token, gemini_key')
      .eq('id', 1)
      .single();

    if (configError || !config) {
      return res.status(400).json({ error: 'Configurações de prospecção não encontradas no banco de dados.' });
    }

    // Identificar qual serviço de proxy está sendo solicitado
    const service = req.method === 'POST' ? req.body.service : req.query.service;

    // ─── PROXY: GEMINI ────────────────────────────────────────────────────────
    if (service === 'gemini') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Gemini Proxy requer método POST' });
      if (!config.gemini_key) return res.status(400).json({ error: 'Chave do Gemini não configurada.' });

      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: 'O parâmetro "prompt" é obrigatório.' });

      const key = config.gemini_key.trim();
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    // ─── PROXY: APIFY ─────────────────────────────────────────────────────────
    if (service === 'apify') {
      if (!config.apify_token) return res.status(400).json({ error: 'Token do Apify não configurado.' });
      let token = config.apify_token.trim();

      if (req.method === 'POST') {
        const { nicho, cidade, estado, limite } = req.body;
        const searchStringsArray = [`${nicho} em ${cidade} - ${estado}`];

        const response = await fetch(`https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchStringsArray,
            maxCrawledPlacesPerSearch: parseInt(limite || 10),
            scrapeWebsite: true,
            scrapeReviews: false,
            scrapePeople: false,
            language: 'pt-BR'
          })
        });

        const data = await response.json();
        return res.status(response.status).json(data);
      }

      if (req.method === 'GET') {
        const { action, runId, datasetId } = req.query;

        if (action === 'status' && runId) {
          const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
          const data = await response.json();
          return res.status(response.status).json(data);
        }

        if (action === 'dataset' && datasetId) {
          const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
          const data = await response.json();
          return res.status(response.status).json(data);
        }

        return res.status(400).json({ error: 'Ação ou parâmetros inválidos no proxy do Apify.' });
      }
    }

    return res.status(400).json({ error: 'Serviço de proxy não especificado ou inválido.' });
  } catch (err) {
    console.error('Erro no proxy de prospecção:', err);
    return res.status(500).json({ error: err.message });
  }
}
