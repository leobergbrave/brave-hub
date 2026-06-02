import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { telefone, orcamento, campanha } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Busca últimas 20 mensagens da conversa
    const { data: conversas } = await supabase
      .from('conversas')
      .select('mensagem, direcao, criado_em')
      .eq('telefone', telefone)
      .order('criado_em', { ascending: false })
      .limit(20);

    const historico = (conversas || [])
      .reverse()
      .map((c: any) => `[${c.direcao === 'recebida' ? 'CLIENTE' : 'VENDEDOR'}]: ${c.mensagem}`)
      .join('\n');

    const itens = (orcamento.payload?.itens || [])
      .map((i: any) => `${i.quantidade}x ${i.nome} — R$${i.preco?.toLocaleString('pt-BR')}`)
      .join(', ');

    const diasDesde = Math.floor(
      (Date.now() - new Date(orcamento.criado_em).getTime()) / 86400000
    );

    const prompt = `Você é um vendedor consultivo da Brave Fitness, empresa brasileira de equipamentos de alta performance para CrossFit e fitness.

CONTEXTO DO CLIENTE:
- Nome: ${orcamento.cliente}
- Equipamentos no orçamento: ${itens || 'não informado'}
- Dias desde o orçamento: ${diasDesde} dias
- Campanha de follow-up: ${campanha}
- Origem: ${orcamento.origem_lead || 'não informado'}

HISTÓRICO DA CONVERSA (mais antigo primeiro):
${historico || '(sem histórico de conversa registrado ainda)'}

Escreva UMA mensagem de WhatsApp para dar continuidade à conversa com esse cliente. Regras:
- Máximo 3 parágrafos curtos
- Tom humano, direto e consultivo — não corporativo
- Leve em conta o que o cliente disse no histórico (se houver)
- Considere o tempo que se passou desde o orçamento
- Não mencione que é automação ou template
- Não use emojis em excesso (máx 2)
- Escreva em português do Brasil informal
- Foque em criar urgência ou resolver objeção conforme o contexto da campanha`;

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 350, temperature: 0.8 },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const mensagemGerada =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'Não foi possível gerar a mensagem. Tente novamente.';

    return new Response(JSON.stringify({ mensagem: mensagemGerada }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
