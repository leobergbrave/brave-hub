// api/_qualificacao-sugerir.js — copiloto de IA da qualificação (sob demanda).
//
// O painel já tem as 6 perguntas MEDDIC-lite e dicas por regra (resumir()). Aqui
// entra a camada que o Léo pediu: à medida que ele anota as respostas, uma IA lê
// o que o cliente REALMENTE disse e devolve (1) a próxima pergunta reescrita e
// personalizada, no tom do Léo no WhatsApp, e (2) uma leitura estratégica curta
// com o próximo movimento. É assistivo: a IA propõe, o Léo revisa e envia —
// mesmo padrão seguro do _cadastro-colar.js (nunca a IA falando sozinha).
//
// A estratégia NÃO é reinventada no prompt: ela já mora nos `porque` de cada
// pergunta (patrocínio p/ durabilidade, Finame p/ preço, trazer o co-decisor,
// dor p/ fechar). Passamos isso como o playbook da IA, então a sugestão sai
// alinhada ao que converte — e muda junto quando o _qualificacao.js mudar.
//
// POST /api/bling?acao=qualificacao_sugerir
//   body: { telefone?, cliente_id?, nome?, respostas: {escopo,metrica,...} }
import { createClient } from '@supabase/supabase-js';
import { PERGUNTAS, trilhaDe, perguntasDaTrilha, resumir } from './_qualificacao.js';

const preenchida = (v) => String(v || '').trim().length >= 2;

/* Próxima pergunta pendente na trilha do negócio (a mesma ordem do painel). */
function proximaPendente(respostas) {
  const relevantes = perguntasDaTrilha(respostas);
  return relevantes.find((p) => !preenchida(respostas[p.chave])) || null;
}

/* Playbook que a IA recebe: título + intenção estratégica de cada pergunta,
   direto dos `porque`. É o que mantém a sugestão dentro da estratégia da BRAVE. */
function playbook() {
  return PERGUNTAS.map((p) => `${p.titulo}: ${p.porque}`).join('\n');
}

function respostasEmTexto(respostas) {
  const linhas = PERGUNTAS
    .filter((p) => preenchida(respostas[p.chave]))
    .map((p) => `${p.titulo}: ${String(respostas[p.chave]).trim().slice(0, 500)}`);
  return linhas.length ? linhas.join('\n') : '(cliente ainda não respondeu nada)';
}

async function chamarGemini(prompt) {
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: cfg } = await supabase.from('prospeccao_config').select('gemini_key').eq('id', 1).maybeSingle();
  if (!cfg?.gemini_key) return null;
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=' + cfg.gemini_key.trim();
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const bruto = (j.candidates?.[0]?.content?.parts?.[0]?.text || '').replace(/```json|```/g, '').trim();
  const ini = bruto.indexOf('{');
  const fim = bruto.lastIndexOf('}');
  if (ini < 0 || fim < 0) return null;
  try { return JSON.parse(bruto.slice(ini, fim + 1)); } catch { return null; }
}

export async function sugerirQualificacao(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  try {
    const respostas = (req.body?.respostas && typeof req.body.respostas === 'object') ? req.body.respostas : {};
    const nome = String(req.body?.nome || '').trim();
    const trilha = trilhaDe(respostas);
    const proxima = proximaPendente(respostas);
    const resumo = resumir(respostas);

    const prompt = [
      'Você é um consultor de vendas sênior da BRAVE (equipamentos fitness de alto padrão), atuando como copiloto do vendedor Léo Berg numa conversa de WhatsApp com um cliente. Fala como o Léo: humano, direto, brasileiro, próximo — nunca robótico nem com cara de formulário.',
      '',
      'PLAYBOOK (por que cada etapa importa — use pra decidir o próximo passo):',
      playbook(),
      '',
      `NEGÓCIO: ${trilha ? trilha.toUpperCase() : 'ainda não classificado'}${nome ? ' · cliente: ' + nome : ''}`,
      '',
      'O QUE O CLIENTE JÁ DISSE:',
      respostasEmTexto(respostas),
      '',
      proxima
        ? `PRÓXIMA ETAPA A DESCOBRIR — ${proxima.titulo} (objetivo: ${proxima.porque}). Modelo genérico da pergunta: "${proxima.pergunta}". Reescreva ELA personalizada, conectando com o que o cliente já falou (cite o contexto dele), 1 a 2 frases, pronta pra enviar no WhatsApp.`
        : 'O cliente já está bem qualificado. Em vez de nova pergunta, escreva a próxima MENSAGEM ideal pra avançar pro fechamento (ancorada no que ele disse: dor, decisor, critério, prazo).',
      '',
      'Responda SOMENTE um JSON válido, sem markdown, neste formato:',
      '{"pergunta":"<a mensagem/pergunta pronta pra enviar, tom do Léo>","leitura":"<2 a 3 linhas: onde o negócio está e o próximo movimento estratégico, pro Léo (não é pra enviar ao cliente)>","alerta":"<1 risco crítico a evitar agora, ou string vazia>"}',
    ].join('\n');

    const ia = await chamarGemini(prompt);

    /* Fallback: sem IA (sem chave/erro), o botão ainda entrega valor — a pergunta
       modelo e a leitura das regras que já existem. Nunca deixa o Léo na mão. */
    if (!ia || !String(ia.pergunta || '').trim()) {
      return res.status(200).json({
        ok: true,
        fonte: 'regras',
        pergunta: proxima?.pergunta || '',
        leitura: (resumo.sinais || []).map((s) => s.texto).join(' ') || 'Siga a próxima pergunta do roteiro.',
        alerta: '',
        proximaChave: proxima?.chave || null,
      });
    }

    return res.status(200).json({
      ok: true,
      fonte: 'ia',
      pergunta: String(ia.pergunta).trim(),
      leitura: String(ia.leitura || '').trim(),
      alerta: String(ia.alerta || '').trim(),
      proximaChave: proxima?.chave || null,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
