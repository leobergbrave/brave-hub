import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é o assistente de extração de orçamentos da BRAVE. Ignore saudações. Extraia apenas os equipamentos e quantidades. Retorne EXCLUSIVAMENTE um array JSON puro neste formato: [{ "termo": "nome limpo do produto", "quantidade": 1 }]`;

// ── Call LLM (OpenAI or Gemini) ──
async function callLLM(texto: string): Promise<Array<{ termo: string; quantidade: number }>> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");

  let rawContent = "";

  if (openaiKey) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: texto },
        ],
      }),
    });
    const data = await res.json();
    rawContent = data.choices?.[0]?.message?.content ?? "[]";
  } else if (geminiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: SYSTEM_PROMPT + "\n\nMensagem do cliente:\n" + texto }] },
        ],
        generationConfig: { temperature: 0.1 },
      }),
    });
    const data = await res.json();
    console.log("Gemini full API response:", JSON.stringify(data).substring(0, 500));
    rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
    console.log("Gemini extracted text:", rawContent);
  } else {
    throw new Error("Nenhuma API key configurada (OPENAI_API_KEY ou GEMINI_API_KEY)");
  }

  // Clean markdown fences if present
  const cleaned = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  console.log("Cleaned for parse:", cleaned);
  return JSON.parse(cleaned);
}

// ── Fuzzy match against produtos table ──
async function matchProdutos(
  supabase: ReturnType<typeof createClient>,
  itensIA: Array<{ termo: string; quantidade: number }>
) {
  const matched: Array<Record<string, unknown>> = [];

  for (const item of itensIA) {
    // Build search words for ilike
    const words = item.termo
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    let found = null;

    // Strategy 1: Try full ilike
    const { data: fullMatch } = await supabase
      .from("produtos")
      .select("id, nome, preco, peso_kg, url_imagem")
      .ilike("nome", `%${item.termo}%`)
      .limit(1);

    if (fullMatch && fullMatch.length > 0) {
      found = fullMatch[0];
    }

    // Strategy 2: Try each significant word
    if (!found && words.length > 0) {
      for (const word of words) {
        const { data: partialMatch } = await supabase
          .from("produtos")
          .select("id, nome, preco, peso_kg, url_imagem")
          .ilike("nome", `%${word}%`)
          .limit(1);

        if (partialMatch && partialMatch.length > 0) {
          found = partialMatch[0];
          break;
        }
      }
    }

    if (found) {
      // Avoid duplicates — merge quantities
      const existing = matched.find((m) => m.id === found!.id);
      if (existing) {
        (existing as any).quantidade += item.quantidade;
      } else {
        matched.push({ ...found, quantidade: item.quantidade });
      }
    }
  }

  return matched;
}

// ── Handler ──
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { texto } = await req.json();
    if (!texto || typeof texto !== "string" || texto.trim().length < 5) {
      return new Response(JSON.stringify({ error: "Texto muito curto ou inválido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Extract from LLM
    let itensIA: Array<{ termo: string; quantidade: number }> = [];
    let debugLLM = "";
    try {
      const result = await callLLM(texto);
      itensIA = result;
      debugLLM = JSON.stringify(result);
    } catch (parseErr) {
      debugLLM = (parseErr as Error).message;
      return new Response(JSON.stringify({ produtos: [], debug: debugLLM, msg: "Erro ao interpretar resposta da IA" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(itensIA) || itensIA.length === 0) {
      return new Response(JSON.stringify({ produtos: [], debug: debugLLM, msg: "Nenhum equipamento identificado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Match against DB
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const produtos = await matchProdutos(supabase, itensIA);

    return new Response(
      JSON.stringify({ produtos, termos_ia: itensIA }),
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
