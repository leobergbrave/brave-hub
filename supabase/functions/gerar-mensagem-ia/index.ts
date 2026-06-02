// deno-lint-ignore-file no-explicit-any
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const BOTCONVERSA_BASE = 'https://backend.botconversa.com.br/api/v1/webhook';

async function getSubscriberByPhone(phone: string, apiKey: string) {
  // Normaliza para formato internacional sem o +
  const tel = phone.replace(/\D/g, '');
  const telNorm = tel.startsWith('55') ? tel : `55${tel}`;

  const res = await fetch(`${BOTCONVERSA_BASE}/subscriber/get_by_phone/${telNorm}/`, {
    headers: { 'api-key': apiKey },
  });

  if (!res.ok) return null;
  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { telefone, orcamento, campanha } = await req.json();

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    const botKey    = Deno.env.get('BOTCONVERSA_API_KEY');

    if (!geminiKey) throw new Error('GEMINI_API_KEY não configurada');
    if (!botKey)    throw new Error('BOTCONVERSA_API_KEY não configurada');

    // ── 1. Busca dados do subscriber no BotConversa ──
    const subscriber = await getSubscriberByPhone(telefone, botKey);

    const tags = (subscriber?.tags || [])
      .map((t: any) => t.name || t)
      .join(', ') || 'nenhuma';

    const sequencias = (subscriber?.sequences || [])
      .map((s: any) => s.name || s)
      .join(', ') || 'nenhuma';

    const camposCustom = (subscriber?.custom_fields || [])
      .filter((f: any) => f.value)
      .map((f: any) => `${f.name}: ${f.value}`)
      .join(' | ') || '';

    const ultimaInteracao = subscriber?.last_interaction
      ? new Date(subscriber.last_interaction).toLocaleDateString('pt-BR')
      : 'desconhecida';

    // ── 2. Monta contexto do orçamento ──
    const itens = (orcamento.payload?.itens || [])
      .map((i: any) => `${i.quantidade}x ${i.nome} — R$${i.preco?.toLocaleString('pt-BR')}`)
      .join(', ') || 'não informado';

    const diasDesde = Math.floor(
      (Date.now() - new Date(orcamento.criado_em).getTime()) / 86400000
    );

    const valorTotal = (orcamento.payload?.itens || [])
      .reduce((acc: number, i: any) => acc + (i.preco || 0) * (i.quantidade || 1), 0);

    // ── 3. Prompt para o Gemini ──
    const prompt = `Você é um vendedor consultivo da Brave Fitness, empresa brasileira de equipamentos de alta performance para CrossFit e fitness.

DADOS DO CLIENTE NO BOTCONVERSA:
- Nome: ${orcamento.cliente}
- Telefone: ${telefone}
- Tags: ${tags}
- Sequências ativas: ${sequencias}
- Campos customizados: ${camposCustom || 'nenhum'}
- Última interação registrada: ${ultimaInteracao}

ORÇAMENTO ENVIADO:
- Equipamentos: ${itens}
- Valor aproximado: R$${valorTotal.toLocaleString('pt-BR')}
- Dias desde o orçamento: ${diasDesde} dias
- Campanha atual: ${campanha}
- Origem do lead: ${orcamento.origem_lead || 'não informado'}

Com base no contexto acima (tags indicam interesse/estágio, sequências indicam onde está no funil), escreva UMA mensagem de WhatsApp para dar continuidade ao relacionamento com esse cliente.

Regras:
- Máximo 3 parágrafos curtos
- Tom humano, direto e consultivo — não corporativo
- Use as tags e sequências para entender o estágio do cliente e personalizar o ângulo
- Considere o tempo desde o orçamento para criar senso de oportunidade
- Não mencione que é automação, campanha ou template
- Máximo 2 emojis
- Português brasileiro informal
- Se tiver sequência de "abandono" ou "sem resposta", foque em reengajamento suave
- Se tiver tag de "quero comprar agora", foque em urgência e facilitar o fechamento`;

    // ── 4. Chama Gemini ──
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 350, temperature: 0.85 },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const mensagemGerada =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'Não foi possível gerar a mensagem. Tente novamente.';

    return new Response(
      JSON.stringify({
        mensagem: mensagemGerada,
        contexto: { tags, sequencias, ultimaInteracao, diasDesde },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    console.error('gerar-mensagem-ia error:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
