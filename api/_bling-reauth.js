// api/_bling-reauth.js — re-autorização do Bling quando o refresh_token expira.
//
// O token OAuth do Bling vence de tempos em tempos; quando o refresh_token
// expira, NENHUMA proposta é criada (sync-bling-proposal devolve "Falha ao
// renovar o token da Bling"). Recuperar exige o passo humano de AUTORIZAR no
// Bling (login) — o que gera um `code` de uso único (~1 min de validade). Este
// endpoint troca esse code por tokens novos e os grava no bling_config, sem
// precisar de node local nem editar o banco à mão.
//
// Fluxo pro Léo:
//   1. Abrir (logado no Bling):
//      https://www.bling.com.br/Api/v3/oauth/authorize?response_type=code&client_id=<CLIENT_ID>&state=hub
//   2. Clicar em "Autorizar" → copiar o valor de `code=` da URL que abrir.
//   3. Abrir: /api/bling?acao=bling_reauth&code=<CODE>
//
// GET/POST /api/bling?acao=bling_reauth&code=...
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function reautorizarBling(req, res) {
  try {
    /* Gate: grava tokens no bling_config, então exige o mesmo segredo do resto
       do HUB (HUB_PDF_TOKEN). Aceita no header x-hub-token OU na query ?t=,
       porque o Léo abre isto como URL no navegador (header é inviável ali). */
    const esperado = process.env.HUB_PDF_TOKEN;
    const fornecido = req.headers['x-hub-token'] || req.query?.t || '';
    if (!esperado || fornecido !== esperado) {
      return res.status(401).json({ ok: false, error: 'Não autorizado (token inválido).' });
    }

    const code = String(req.query?.code || req.body?.code || '').trim();
    if (!code) {
      return res.status(400).json({ ok: false, error: 'Faltou o parâmetro ?code= (o código que o Bling mostra ao autorizar).' });
    }

    const { data: cfg, error } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
    if (error || !cfg?.client_id || !cfg?.client_secret) {
      return res.status(500).json({ ok: false, error: 'bling_config sem client_id/client_secret.' });
    }

    const credentials = Buffer.from(`${cfg.client_id}:${cfg.client_secret}`).toString('base64');
    const r = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: '1.0',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code }),
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || !j.access_token) {
      // O code expira em ~1 min e é de uso único: o erro mais comum é code velho.
      return res.status(502).json({
        ok: false,
        error: 'O Bling recusou o código. Ele expira em ~1 minuto e só serve uma vez — gere um novo autorizando de novo.',
        detalhe: j?.error_description || j?.error || null,
      });
    }

    await supabaseAdmin.from('bling_config').update({
      access_token: j.access_token,
      refresh_token: j.refresh_token,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);

    return res.status(200).json({ ok: true, mensagem: 'Token do Bling renovado com sucesso! Já pode gerar as propostas.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
