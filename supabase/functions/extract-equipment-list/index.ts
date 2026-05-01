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
    if (data.error) {
      console.error("Gemini API Error:", data.error);
      throw new Error("Erro na API do Gemini: " + data.error.message);
    }
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

// ── Levenshtein Distance ──
function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

// ── Fuzzy match against produtos table ──
async function matchProdutos(
  supabase: ReturnType<typeof createClient>,
  itensIA: Array<{ termo: string; quantidade: number }>
) {
  const resolucoes: Array<{ termo_original: string; quantidade: number; opcoes: Array<Record<string, unknown>> }> = [];

  // Fetch all products once for in-memory fuzzy matching (fast for < 1000 items)
  const { data: allProducts } = await supabase.from("produtos").select("id, nome, preco, peso_kg, url_imagem");
  if (!allProducts) return resolucoes;

  for (const item of itensIA) {
    const termRaw = item.termo.toLowerCase().trim();
    const termNoSpace = termRaw.replace(/[^a-z0-9]/g, '');
    const termWords = termRaw.split(/\s+/).filter(w => w.length > 2);

    const scored = allProducts.map(p => {
      const nomeRaw = p.nome.toLowerCase();
      const nomeNoSpace = nomeRaw.replace(/[^a-z0-9]/g, '');
      const nomeWords = nomeRaw.split(/\s+/).filter(w => w.length > 2);
      
      let score = 0;
      
      // 1. Exact inclusion
      if (nomeRaw.includes(termRaw) || termRaw.includes(nomeRaw)) score += 100;
      
      // 2. No-space inclusion (catches BIKERG vs BIKE ERG)
      if (nomeNoSpace.includes(termNoSpace) || termNoSpace.includes(nomeNoSpace)) score += 50;

      // 3. Word overlap (with slight typo tolerance)
      let overlap = 0;
      for (const tw of termWords) {
        if (nomeWords.some(nw => nw.includes(tw) || tw.includes(nw) || levenshtein(tw, nw) <= 1)) {
          overlap++;
        }
      }
      score += (overlap * 20);

      // 4. Distance of the no-space versions (for misspellings)
      const dist = levenshtein(termNoSpace, nomeNoSpace);
      if (dist <= 2) score += 30;
      else if (dist <= 4) score += 10;

      return { ...p, score };
    });

    // Filter by threshold and sort by highest score
    const matches = scored
      .filter(p => p.score >= 20)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // Remove score from final payload
    const finalMatches = matches.map(({ score, ...rest }) => rest);

    if (finalMatches.length > 0) {
      resolucoes.push({
        termo_original: item.termo,
        quantidade: item.quantidade,
        opcoes: finalMatches
      });
    }
  }

  return resolucoes;
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

    const resolucoes = await matchProdutos(supabase, itensIA);

    return new Response(
      JSON.stringify({ resolucoes, termos_ia: itensIA }),
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
