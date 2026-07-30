// api/entrada-rapida.js — lê um print (ou texto) enviado pelo Tiago com dados de
// cliente e extrai: nome, telefone e equipamentos desejados. Usa o Gemini (mesma
// chave da prospecção, em prospeccao_config.gemini_key).
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { imagem, texto } = req.body || {};
  if (!imagem && !(texto || '').trim()) {
    return res.status(400).json({ ok: false, error: 'Envie um print (imagem) ou o texto da mensagem.' });
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: cfg } = await supabase.from('prospeccao_config').select('*').eq('id', 1).maybeSingle();
  if (!cfg?.gemini_key) return res.status(400).json({ ok: false, error: 'Chave do Gemini não configurada (prospeccao_config).' });

  const prompt = `Você recebe um print de conversa de WhatsApp (ou texto) com dados de um cliente interessado em equipamentos de ginástica/crossfit da marca BRAVE.
Extraia e responda SOMENTE um JSON válido, sem markdown, neste formato:
{"nome": "nome do cliente ou vazio", "telefone": "somente dígitos com DDD, sem +55, ou vazio", "equipamentos": ["lista dos equipamentos/produtos mencionados"], "observacao": "resumo de 1 frase do contexto (cidade, urgência, box, etc) ou vazio"}
Regras: telefone brasileiro (10-11 dígitos após remover o 55). Se houver mais de um telefone, use o do cliente (não o do Tiago/Brave). Equipamentos em português, um por item.${(texto || '').trim() ? `\n\nTexto adicional:\n${texto.trim()}` : ''}`;

  const parts = [{ text: prompt }];
  if (imagem) {
    const m = String(imagem).match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
    parts.push({
      inline_data: {
        mime_type: m ? m[1] : 'image/png',
        data: m ? m[2] : String(imagem),
      },
    });
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${cfg.gemini_key.trim()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      }
    );
    if (!r.ok) {
      const t = await r.text();
      return res.status(200).json({ ok: false, error: `Gemini respondeu ${r.status}: ${t.slice(0, 200)}` });
    }
    const j = await r.json();
    const raw = j.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonTxt = raw.replace(/```json|```/g, '').trim();
    const dados = JSON.parse(jsonTxt.slice(jsonTxt.indexOf('{'), jsonTxt.lastIndexOf('}') + 1));
    return res.status(200).json({
      ok: true,
      nome: dados.nome || '',
      telefone: String(dados.telefone || '').replace(/\D/g, ''),
      equipamentos: Array.isArray(dados.equipamentos) ? dados.equipamentos : [],
      observacao: dados.observacao || '',
    });
  } catch (e) {
    return res.status(200).json({ ok: false, error: 'Não consegui interpretar o print: ' + e.message });
  }
}
