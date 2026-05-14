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

    const { fileBase64, mimeType } = await req.json();

    if (!fileBase64 || !mimeType) {
      return new Response(JSON.stringify({ error: "Arquivo não enviado" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: "Extraia todo o texto deste PDF. Retorne apenas o texto puro, sem formatação markdown, sem cabeçalhos extras. Foque em listas de produtos/equipamentos se existirem, preservando quantidades." },
            { inlineData: { mimeType, data: fileBase64 } },
          ],
        }],
        generationConfig: { temperature: 0.1 },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`Gemini HTTP ${res.status}:`, errText);
      throw new Error(`Gemini retornou ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      throw new Error("Gemini: " + (data.error.message || JSON.stringify(data.error)));
    }

    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return new Response(
      JSON.stringify({ texto }),
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
