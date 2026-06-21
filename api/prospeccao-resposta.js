import { createClient } from '@supabase/supabase-js';

const PADROES_AUTO = [
  /protocolo\s*#?\d+/i,
  /n[uú]mero\s*de\s*protocolo/i,
  /fora\s*do\s*hor[aá]rio/i,
  /hor[aá]rio\s*de\s*atendimento/i,
  /recebemos\s*sua\s*mensagem/i,
  /em\s*breve\s*(retornaremos|entraremos|responderemos)/i,
  /obrigad[oa]\s*pelo\s*contato/i,
  /atendimento\s*autom[aá]tico/i,
  /ser[aá]\s*atendid[oa]/i,
  /mensagem\s*autom[aá]tica/i,
  /resposta\s*autom[aá]tica/i,
  /sistema\s*de\s*atendimento/i,
  /chatbot/i,
  /aguarde\s*(um\s*momento|nosso|por\s*favor)/i,
  /sua\s*mensagem\s*foi\s*recebida/i,
];

function classificarPadroes(texto) {
  return PADROES_AUTO.some(p => p.test(texto));
}

async function classificarComGemini(texto, geminiKey) {
  try {
    const prompt = `Analise esta mensagem de WhatsApp e responda APENAS com "auto" ou "humano":
"${texto}"

"auto" = resposta automática/bot/protocolo/fora do horário/mensagem programada.
"humano" = mensagem real de uma pessoa (pode ser curta: "ok", "sim", "quero saber mais", "pode mandar").`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${geminiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const resposta = data.candidates?.[0]?.content?.parts?.[0]?.text?.toLowerCase().trim() || '';
    return resposta.includes('auto') ? 'auto' : 'humano';
  } catch (e) {
    console.warn('[Resposta] Gemini falhou:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  // Parse flexível do payload — Botconversa pode enviar em vários formatos
  const body = req.body || {};
  const telefone = (
    body.phone || body.telefone || body.contact?.phone ||
    body.from || body.data?.phone || body.sender || ''
  ).toString().replace(/\D/g, '');

  const texto = (
    body.message || body.mensagem || body.text || body.body ||
    body.message?.text || body.data?.message || body.data?.text || ''
  ).toString().trim();

  const nomeContato = (
    body.name || body.nome || body.contact?.name || body.contact?.pushname || ''
  ).toString().trim();

  console.log(`[Resposta] telefone=${telefone} texto="${texto.slice(0, 100)}" nome="${nomeContato}"`);

  if (!telefone || !texto) {
    return res.status(200).json({ ok: false, reason: 'Payload sem telefone ou texto — verifique o formato do webhook do Botconversa' });
  }

  // Responder imediatamente para não dar timeout no Botconversa
  res.status(200).json({ ok: true, message: 'Processando...' });

  const { data: config } = await supabase
    .from('prospeccao_config').select('gemini_key').eq('id', 1).maybeSingle();

  // Buscar lead correspondente na fila pelo telefone
  const { data: leadFila } = await supabase
    .from('prospeccao_fila_envio')
    .select('id, nome_empresa, telefone, mensagem')
    .eq('telefone', telefone)
    .order('criado_em', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Verificar se já existe registro de resposta para este telefone
  const { data: respostaExistente } = await supabase
    .from('prospeccao_respostas')
    .select('*')
    .eq('telefone', telefone)
    .maybeSingle();

  // ── Classificação híbrida ────────────────────────────────────────────────
  let tipoMensagem = 'humana';
  const ehAutoPattern = classificarPadroes(texto);

  if (ehAutoPattern) {
    tipoMensagem = 'auto';
    console.log('[Resposta] Classificado como AUTO por padrão de texto');
  } else if (config?.gemini_key && texto.length > 15) {
    const geminiResult = await classificarComGemini(texto, config.gemini_key);
    if (geminiResult === 'auto') {
      tipoMensagem = 'auto';
      console.log('[Resposta] Classificado como AUTO pelo Gemini');
    } else {
      console.log('[Resposta] Classificado como HUMANO pelo Gemini');
    }
  }

  const agora = new Date();
  const novaMensagem = { texto, recebida_em: agora.toISOString(), tipo: tipoMensagem };

  if (respostaExistente) {
    // ── Atualizar registro existente ────────────────────────────────────────
    const mensagens = [...(respostaExistente.mensagens || []), novaMensagem];
    let novoScore = respostaExistente.score;
    let novoStatus = respostaExistente.status;
    let novaJanela = respostaExistente.janela_expira_em;

    if (tipoMensagem === 'auto') {
      // Auto-reply adicional: mantém janela, pequeno bump de score
      if (novoScore === 0) {
        novoScore = 1;
        novaJanela = new Date(agora.getTime() + 48 * 60 * 60 * 1000).toISOString();
        novoStatus = 'aguardando';
      }
    } else {
      // Resposta humana: sobe score e confirma interesse
      const bonus = novoStatus === 'aguardando' ? 5 : 3;
      novoScore = Math.min(10, novoScore + bonus);
      novoStatus = 'interessado';
      novaJanela = null; // janela cumprida
    }

    await supabase.from('prospeccao_respostas').update({
      mensagens,
      score: novoScore,
      status: novoStatus,
      janela_expira_em: novaJanela,
      ultima_mensagem_em: agora.toISOString()
    }).eq('id', respostaExistente.id);

    console.log(`[Resposta] Atualizado id=${respostaExistente.id} status=${novoStatus} score=${novoScore}`);
  } else {
    // ── Criar novo registro ─────────────────────────────────────────────────
    let score = 0;
    let status = 'aguardando';
    let janela_expira_em = null;

    if (tipoMensagem === 'auto') {
      score = 1;
      janela_expira_em = new Date(agora.getTime() + 48 * 60 * 60 * 1000).toISOString();
      status = 'aguardando';
    } else {
      score = 5;
      status = 'interessado';
    }

    const { data: novoRegistro, error: errInsert } = await supabase.from('prospeccao_respostas').insert({
      fila_id: leadFila?.id || null,
      telefone,
      nome_empresa: leadFila?.nome_empresa || nomeContato || `+${telefone}`,
      mensagens: [novaMensagem],
      score,
      status,
      janela_expira_em,
      ultima_mensagem_em: agora.toISOString()
    }).select().single();

    if (errInsert) {
      console.error('[Resposta] Erro ao inserir:', errInsert.message);
    } else {
      console.log(`[Resposta] Criado id=${novoRegistro?.id} status=${status} score=${score} tipo=${tipoMensagem}`);
    }
  }
}
