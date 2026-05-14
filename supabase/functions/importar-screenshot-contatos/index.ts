const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiKey) throw new Error("GEMINI_API_KEY não configurada");

    const { imageBase64, mimeType } = await req.json();
    if (!imageBase64) throw new Error("Imagem não enviada");

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              text: `Analise esta captura de tela de um CRM ou lista de contatos e extraia TODOS os contatos visíveis.
Retorne APENAS um JSON array válido (sem markdown, sem texto extra, sem blocos de código) no formato:
[{"nome": "...", "telefone": "...", "email": "...", "empresa": "..."}]

Regras para EMAIL (importante):
- Se o email estiver completo, use-o exatamente como está
- Se o email estiver truncado (ex: "joao.silva@gmail...", "maria@hotm...", "pedro123@yah..."):
  * Tente completar se reconhecer o domínio: @gmail.com, @hotmail.com, @yahoo.com, @yahoo.com.br, @outlook.com, @icloud.com, @live.com, @bol.com.br, @uol.com.br, @terra.com.br
  * Exemplo: "joao.silva@gmail..." → "joao.silva@gmail.com"
  * Exemplo: "maria@hotm..." → "maria@hotmail.com"
  * Exemplo: "pedro@yah..." → "pedro@yahoo.com"
- Se o domínio não for identificável (ex: "@minhaempresa...", "@crm..."), use null para email
- Se não houver email visível, use null

Outras regras:
- Se nome, telefone ou empresa não estiver visível, use null
- Telefone: mantenha o número como está na tela
- Extraia todos os contatos visíveis, mesmo que incompletos
- Responda SOMENTE com o array JSON, nada mais`,
            },
            { inlineData: { mimeType: mimeType || "image/png", data: imageBase64 } },
          ],
        }],
        generationConfig: { temperature: 0.1 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini retornou ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data = await res.json();
    if (data.error) throw new Error("Gemini: " + (data.error.message || JSON.stringify(data.error)));

    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Extract JSON array from response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error("Não foi possível identificar contatos na imagem.");

    const contatos = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(contatos)) throw new Error("Resposta da IA em formato inesperado.");

    return new Response(
      JSON.stringify({ contatos }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge Function error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message || "Erro interno" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
