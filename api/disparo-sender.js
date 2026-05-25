import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function nowBRT() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function todayBRT() {
  return nowBRT().toISOString().split('T')[0];
}

function isWithinWindow(cfg) {
  const brt    = nowBRT();
  const hour   = brt.getUTCHours();
  const min    = brt.getUTCMinutes();
  const jsDow  = brt.getUTCDay();           // 0=Dom, 1=Seg..6=Sáb
  const ourDow = jsDow === 0 ? 7 : jsDow;  // converte: 1=Seg..7=Dom

  const [startH, startM] = (cfg.hora_inicio || '08:00').split(':').map(Number);
  const [endH,   endM  ] = (cfg.hora_fim    || '18:00').split(':').map(Number);

  const now   = hour * 60 + min;
  const start = startH * 60 + startM;
  const end   = endH   * 60 + endM;

  const dias = cfg.dias_semana || [1, 2, 3, 4, 5];
  return dias.includes(ourDow) && now >= start && now < end;
}

function randomDelayMs(minMin, maxMin) {
  const minMs = (minMin || 1)  * 60 * 1000;
  const maxMs = (maxMin || 30) * 60 * 1000;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export default async function handler(req) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
  };

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  // Autenticação via secret header
  const secret = process.env.DISPARO_CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const supabase = getSupabase();

  // Carrega configurações do banco
  const { data: cfg } = await supabase
    .from('disparo_config')
    .select('*')
    .limit(1)
    .maybeSingle();

  if (!cfg) {
    return new Response(JSON.stringify({ ok: true, skipped: 'configuração não encontrada' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Verifica janela de horário
  if (!isWithinWindow(cfg)) {
    return new Response(JSON.stringify({ ok: true, skipped: `fora da janela (${cfg.hora_inicio}–${cfg.hora_fim})` }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const now    = new Date();
  const nowIso = now.toISOString();
  const today  = todayBRT();

  // Busca campanhas ativas
  const { data: campanhas } = await supabase
    .from('disparo_campanhas')
    .select('*')
    .eq('status', 'ativa');

  if (!campanhas?.length) {
    return new Response(JSON.stringify({ ok: true, skipped: 'nenhuma campanha ativa' }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const results = [];

  for (const campanha of campanhas) {
    // Reset contador diário se mudou o dia
    if (campanha.ultima_data !== today) {
      await supabase.from('disparo_campanhas')
        .update({ enviados_hoje: 0, ultima_data: today })
        .eq('id', campanha.id);
      campanha.enviados_hoje = 0;
    }

    // Verifica limite diário
    if (campanha.enviados_hoje >= (cfg.max_por_dia || 50)) {
      results.push({ campanha_id: campanha.id, skipped: 'limite diário atingido' });
      continue;
    }

    // Busca próximo item pronto para enviar
    const { data: items } = await supabase
      .from('disparo_fila')
      .select('id, campanha_id, nome, telefone')
      .eq('campanha_id', campanha.id)
      .eq('status', 'pending')
      .lte('send_after', nowIso)
      .order('send_after', { ascending: true })
      .limit(1);

    if (!items?.length) {
      // Verifica se fila está realmente vazia
      const { count } = await supabase
        .from('disparo_fila')
        .select('*', { count: 'exact', head: true })
        .eq('campanha_id', campanha.id)
        .eq('status', 'pending');

      if ((count ?? 0) === 0) {
        await supabase.from('disparo_campanhas')
          .update({ status: 'concluida' })
          .eq('id', campanha.id);
        results.push({ campanha_id: campanha.id, completed: true });
      } else {
        results.push({ campanha_id: campanha.id, skipped: 'próximo envio agendado no futuro' });
      }
      continue;
    }

    const item = items[0];

    // Envia ao BotConversa
    let sent  = false;
    let erro  = null;

    if (!cfg.webhook_url) {
      erro = 'Webhook URL não configurada';
    } else {
      try {
        let tel = (item.telefone || '').replace(/\D/g, '');
        if (tel.length === 10 || tel.length === 11) tel = '55' + tel;

        const res = await fetch(cfg.webhook_url, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ cliente: item.nome || '', telefone: tel }),
        });
        sent = res.ok;
        if (!sent) erro = `HTTP ${res.status}`;
      } catch (e) {
        erro = e.message;
      }
    }

    // Atualiza item da fila
    await supabase.from('disparo_fila')
      .update({ status: sent ? 'sent' : 'failed', sent_at: nowIso, erro: erro || null })
      .eq('id', item.id);

    if (sent) {
      // Atualiza contadores da campanha
      await supabase.from('disparo_campanhas')
        .update({
          enviados_hoje:  campanha.enviados_hoje + 1,
          enviados_total: (campanha.enviados_total || 0) + 1,
          ultima_data:    today,
        })
        .eq('id', campanha.id);

      // Agenda próximo item com delay aleatório
      const delayMs       = randomDelayMs(cfg.delay_min_min, cfg.delay_max_min);
      const nextSendAfter = new Date(Date.now() + delayMs).toISOString();
      const delayMin      = Math.round(delayMs / 60000);

      const { data: nextItems } = await supabase
        .from('disparo_fila')
        .select('id')
        .eq('campanha_id', campanha.id)
        .eq('status', 'pending')
        .order('criado_em', { ascending: true })
        .limit(1);

      if (nextItems?.length) {
        await supabase.from('disparo_fila')
          .update({ send_after: nextSendAfter })
          .eq('id', nextItems[0].id);
      }

      results.push({ campanha_id: campanha.id, telefone: item.telefone, sent: true, proximo_em_min: delayMin });
    } else {
      await supabase.from('disparo_campanhas')
        .update({ falhas_total: (campanha.falhas_total || 0) + 1 })
        .eq('id', campanha.id);
      results.push({ campanha_id: campanha.id, telefone: item.telefone, sent: false, erro });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
