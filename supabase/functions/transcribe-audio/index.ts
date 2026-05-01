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
      return new Response(JSON.stringify({ error: "Arquivo de áudio não enviado" }), {
        status: 400,
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
            { text: "Transcreva este áudio para texto em Português Brasileiro. Retorne APENAS a transcrição pura do que foi dito, sem comentários, sem formatação, sem cabeçalhos. Se mencionarem produtos, equipamentos ou quantidades, preserve exatamente como foi dito." },
            { inlineData: { mimeType, data: fileBase64 } },
          ],
        }],
        generationConfig: { temperature: 0.1 },
      }),
    });

    const data = await res.json();
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      throw new Error("Erro na API do Gemini: " + data.error.message);
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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
