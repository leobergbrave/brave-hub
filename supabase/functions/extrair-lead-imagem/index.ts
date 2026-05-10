const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType } = await req.json();
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada');

    const prompt = `Analise esta screenshot do RD Station CRM. Extraia estas informações e retorne APENAS um JSON válido, sem markdown, sem explicações:

{
  "nome": "APENAS o primeiro nome do lead (ex: se for 'João Silva', retorne 'João')",
  "telefone": "número de telefone sem formatação, apenas dígitos incluindo código do país (ex: 5511999999999)",
  "email": "endereço de e-mail do contato, se visível na tela (senão string vazia)",
  "momento_compra": "um dos 4 valores exatos abaixo",
  "produtos_interesse": ["array de aliases conforme mapeamento"]
}

Valores exatos para momento_compra (use exatamente um desses):
- "Quero comprar agora"
- "Quero comprar em breve (até 30 dias)"
- "Estou comparando opções"
- "Só quero entender melhor o produto"

Mapeamento equipamentos → aliases (campo "Equipamento | Ergometro"):
- Bike Erg → bikeerg
- Remo → remo
- Ski → skierg
- Storm Bike → storm
- Esteira Curva → estcv
- Escada → escada

Regras:
- nome: retorne SOMENTE o primeiro nome, nunca o sobrenome
- telefone: use o primeiro número da seção Contatos, remova todo símbolo (espaço, +, -, parênteses)
- email: procure na seção Contatos (ícone de envelope), retorne o endereço completo se visível
- Se o texto do equipamento estiver cortado (ex: "Est..."), inclua Esteira Curva (estcv)
- Se não encontrar algum campo, deixe como string vazia ou array vazio`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: mimeType || 'image/png', data: imageBase64 } },
            ],
          }],
          generationConfig: { temperature: 0 },
        }),
      }
    );

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Gemini API error ${res.status}: ${errBody}`);
    }

    const result = await res.json();
    let text = result.candidates?.[0]?.content?.parts?.[0]?.text || '{}';

    // Remove markdown code fences if Gemini added them
    text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const parsed = JSON.parse(text);

    // Normalize telefone to digits only
    if (parsed.telefone) {
      parsed.telefone = String(parsed.telefone).replace(/\D/g, '');
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Erro ao extrair dados da imagem:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
