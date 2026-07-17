// deno-lint-ignore-file no-explicit-any
// Cerebro do rascunho de atendimento.
//
// O usuario so consegue RESPONDER dentro do FSS (nao edita a IA nativa, nao mexe em
// workflow). Entao esta funcao nao envia nada: ela le a conversa e devolve um RASCUNHO
// de resposta, que o userscript mostra pro humano aprovar e enviar.
//
// A IA nativa do FSS qualifica ("1-Ergo, 2-Box, 3-Academia") e passa pro humano, mas
// NAO responde preco/combo/frete. Esse e o buraco que este rascunho preenche, com os
// dados reais da Brave (tabela produtos).
//
// Guardrails (ver PROMPT): nunca inventa preco, estoque, prazo nem frete. O que nao
// estiver no catalogo, ou for negociacao/desconto/pagamento, vira precisa_humano=true.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-fss-secret',
};

function fmtBRL(v: number | null | undefined): string {
  if (v == null || v <= 0) return 'sob consulta';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function montarCatalogo(produtos: any[]): string {
  if (!produtos?.length) return '(catalogo indisponivel)';
  return produtos.map((p) => {
    const avista = fmtBRL(p.preco_avista);
    const prazo = p.preco_prazo > 0 ? `${fmtBRL(p.preco_prazo)} em ate 10x` : 'sob consulta';
    return `- ${p.nome}${p.codigo_sku ? ` (${p.codigo_sku})` : ''}: a vista ${avista} | parcelado ${prazo}`;
  }).join('\n');
}

function montarConversa(mensagens: any[]): string {
  return (mensagens || []).map((m: any) => {
    const quem = m.de === 'empresa' || m.de === 'brave' ? 'BRAVE' : 'CLIENTE';
    return `${quem}: ${String(m.texto || '').trim()}`;
  }).join('\n');
}

const PROMPT = (ctx: { catalogo: string; conversa: string; nome: string; tags: string }) =>
`Voce e um vendedor consultivo da Brave Fitness, empresa brasileira de equipamentos de
alta performance (ergometros para CrossFit, Hyrox e academias).

Sua tarefa: escrever a PROXIMA mensagem que a Brave enviaria pra este cliente no WhatsApp,
dando continuidade a conversa abaixo. O texto que voce escrever e um RASCUNHO — um humano
da Brave vai revisar antes de enviar.

CATALOGO OFICIAL (unica fonte de preco — nao existe preco fora desta lista):
${ctx.catalogo}

CLIENTE: ${ctx.nome || 'nao informado'}
TAGS DO LEAD: ${ctx.tags || 'nenhuma'}

CONVERSA ATE AGORA:
${ctx.conversa}

REGRAS INEGOCIAVEIS:
- NUNCA invente preco, estoque, disponibilidade ou prazo de entrega. So cite preco que
  esta no CATALOGO OFICIAL acima, exatamente como esta.
- Se o cliente perguntar algo que NAO esta no catalogo (ex: kettlebell, anilha, acessorio,
  um equipamento que nao aparece na lista), NAO invente. Diga que vai confirmar com o time
  e marque precisa_humano.
- FRETE: voce NAO consegue calcular aqui. Se perguntarem frete, peca o CEP (se ainda nao
  tiver) e diga que ja calcula certinho — nunca chute um valor.
- Desconto, condicao especial de pagamento, negociacao de valor: NAO prometa nada, passe
  pro humano (precisa_humano).
- Se a conversa ja estiver num vendedor humano ou pedindo algo que exige decisao comercial,
  precisa_humano = true.

ESTILO:
- Portugues brasileiro, tom humano e direto, consultivo — nunca corporativo ou robotico.
- No maximo 3 paragrafos curtos. No maximo 2 emojis.
- Nao diga que e uma IA, automacao ou template.

Responda SOMENTE com um JSON valido, sem texto fora dele, neste formato:
{"sugestao": "<a mensagem pronta pra enviar>", "precisa_humano": <true|false>, "motivo": "<curto: por que precisa de humano, ou vazio>", "confianca": <0 a 100>}`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status });

  try {
    const segredo = Deno.env.get('FSS_WEBHOOK_SECRET');
    if (segredo && req.headers.get('x-fss-secret') !== segredo) {
      return json({ error: 'nao autorizado' }, 401);
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) throw new Error('GEMINI_API_KEY nao configurada');

    const { mensagens, nomeCliente, tags } = await req.json();
    if (!Array.isArray(mensagens) || !mensagens.length) {
      return json({ error: 'mensagens (array) e obrigatorio' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const { data: produtos } = await supabase
      .from('produtos')
      .select('nome, preco_avista, preco_prazo, codigo_sku');

    const prompt = PROMPT({
      catalogo: montarCatalogo(produtos || []),
      conversa: montarConversa(mensagens),
      nome: nomeCliente || '',
      tags: Array.isArray(tags) ? tags.join(', ') : (tags || ''),
    });

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 500, temperature: 0.7, responseMimeType: 'application/json' },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok || geminiData.error) {
      throw new Error('Gemini: ' + (geminiData?.error?.message || `HTTP ${geminiRes.status}`));
    }

    const bruto = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(bruto);
    } catch {
      // Se o modelo escapou do JSON, devolve o texto cru como sugestao em vez de quebrar.
      parsed = { sugestao: bruto, precisa_humano: true, motivo: 'resposta fora do formato', confianca: 0 };
    }

    return json({
      sugestao: parsed.sugestao || '',
      precisa_humano: parsed.precisa_humano === true,
      motivo: parsed.motivo || '',
      confianca: Number(parsed.confianca) || 0,
      produtos_no_catalogo: (produtos || []).length,
    });
  } catch (err: any) {
    console.error('[sugerir-resposta]', err.message);
    return json({ error: err.message }, 500);
  }
});
