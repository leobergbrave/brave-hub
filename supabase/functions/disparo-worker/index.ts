import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function nowBRT(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function todayBRT(): string {
  return nowBRT().toISOString().split("T")[0];
}

function isWithinWindow(config: any): boolean {
  const brt = nowBRT();
  const brtHour = brt.getUTCHours();
  const brtMin  = brt.getUTCMinutes();
  const jsDow   = brt.getUTCDay(); // 0=Dom, 1=Seg..6=Sab
  const ourDow  = jsDow === 0 ? 7 : jsDow; // converte: 1=Seg..7=Dom

  const [startH, startM] = (config.hora_inicio || "08:00").split(":").map(Number);
  const [endH,   endM  ] = (config.hora_fim    || "18:00").split(":").map(Number);

  const now   = brtHour * 60 + brtMin;
  const start = startH  * 60 + startM;
  const end   = endH    * 60 + endM;

  const dias: number[] = config.dias_semana || [1, 2, 3, 4, 5];
  return dias.includes(ourDow) && now >= start && now < end;
}

function randomDelayMs(minMin: number, maxMin: number): number {
  const minMs = minMin * 60 * 1000;
  const maxMs = maxMin * 60 * 1000;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { data: config } = await supabase
      .from("disparo_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!config) {
      return new Response(JSON.stringify({ skipped: true, reason: "Configuração não encontrada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isWithinWindow(config)) {
      return new Response(JSON.stringify({ skipped: true, reason: `Fora da janela (${config.hora_inicio}–${config.hora_fim} dias ${config.dias_semana})` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const today = todayBRT();

    const { data: campanhas } = await supabase
      .from("disparo_campanhas")
      .select("*")
      .eq("status", "ativa");

    if (!campanhas?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "Nenhuma campanha ativa" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any[] = [];

    for (const campanha of campanhas) {
      // Reset contador diário se mudou o dia
      if (campanha.ultima_data !== today) {
        await supabase.from("disparo_campanhas")
          .update({ enviados_hoje: 0, ultima_data: today })
          .eq("id", campanha.id);
        campanha.enviados_hoje = 0;
      }

      // Verificar limite diário
      if (campanha.enviados_hoje >= (config.max_por_dia || 50)) {
        results.push({ campanha_id: campanha.id, skipped: true, reason: "Limite diário atingido" });
        continue;
      }

      // Buscar próximo item da fila
      const { data: item } = await supabase
        .from("disparo_fila")
        .select("*")
        .eq("campanha_id", campanha.id)
        .eq("status", "pending")
        .lte("send_after", new Date().toISOString())
        .order("send_after", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!item) {
        const { count } = await supabase
          .from("disparo_fila")
          .select("*", { count: "exact", head: true })
          .eq("campanha_id", campanha.id)
          .eq("status", "pending");

        if ((count ?? 0) === 0) {
          await supabase.from("disparo_campanhas")
            .update({ status: "concluida" })
            .eq("id", campanha.id);
          results.push({ campanha_id: campanha.id, completed: true });
        } else {
          results.push({ campanha_id: campanha.id, skipped: true, reason: "Próximo envio agendado no futuro" });
        }
        continue;
      }

      // Disparar webhook
      let ok = false;
      let erro: string | undefined;

      if (!config.webhook_url) {
        erro = "Webhook URL não configurada";
      } else {
        try {
          let tel = (item.telefone || "").replace(/\D/g, "");
          if (tel.length === 10 || tel.length === 11) tel = "55" + tel;

          const res = await fetch(config.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cliente: item.nome || "", telefone: tel }),
          });
          ok = res.ok;
          if (!ok) erro = `HTTP ${res.status}`;
        } catch (e: any) {
          erro = e.message;
        }
      }

      // Atualizar item da fila
      await supabase.from("disparo_fila")
        .update({
          status: ok ? "sent" : "failed",
          sent_at: ok ? new Date().toISOString() : null,
          erro: erro || null,
        })
        .eq("id", item.id);

      if (ok) {
        // Atualizar contadores da campanha
        await supabase.from("disparo_campanhas")
          .update({
            enviados_hoje:  campanha.enviados_hoje + 1,
            enviados_total: (campanha.enviados_total || 0) + 1,
            ultima_data: today,
          })
          .eq("id", campanha.id);

        // Agendar próximo item com delay aleatório
        const delay = randomDelayMs(config.delay_min_min || 1, config.delay_max_min || 30);
        const nextSendAfter = new Date(Date.now() + delay).toISOString();

        const { data: nextItem } = await supabase
          .from("disparo_fila")
          .select("id")
          .eq("campanha_id", campanha.id)
          .eq("status", "pending")
          .order("criado_em", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (nextItem) {
          await supabase.from("disparo_fila")
            .update({ send_after: nextSendAfter })
            .eq("id", nextItem.id);
        }
      } else {
        await supabase.from("disparo_campanhas")
          .update({ falhas_total: (campanha.falhas_total || 0) + 1 })
          .eq("id", campanha.id);
      }

      results.push({
        campanha_id: campanha.id,
        fila_id: item.id,
        telefone: item.telefone,
        status: ok ? "sent" : "failed",
        erro,
      });
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
