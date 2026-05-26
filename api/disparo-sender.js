export const config = { runtime: 'edge' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-cron-secret',
};

function sbBase() { return process.env.VITE_SUPABASE_URL + '/rest/v1'; }
function sbKey()  { return process.env.SUPABASE_SERVICE_ROLE_KEY; }

function sbHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    apikey: sbKey(),
    Authorization: `Bearer ${sbKey()}`,
    ...extra,
  };
}

async function dbSelect(table, qs, cols = '*') {
  const r = await fetch(`${sbBase()}/${table}?${qs}&select=${cols}`, { headers: sbHeaders() });
  if (!r.ok) throw new Error(`GET ${table}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function dbCount(table, qs) {
  const r = await fetch(`${sbBase()}/${table}?${qs}&select=id`, {
    headers: sbHeaders({ Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }),
  });
  const cr = r.headers.get('content-range') || '*/0';
  return parseInt(cr.split('/')[1]) || 0;
}

async function dbPatch(table, filter, data) {
  const r = await fetch(`${sbBase()}/${table}?${filter}`, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`PATCH ${table}: ${r.status} ${await r.text()}`);
}

function nowBRT() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function todayBRT() {
  return nowBRT().toISOString().split('T')[0];
}

// Desloca um timestamp proposto (ms) para o próximo slot válido dentro da janela (BRT).
// Usado para agendar o PRÓXIMO item após cada envio — não bloqueia o primeiro envio.
function nextWindowSlot(cfg, proposedMs) {
  const [startH, startM] = (cfg.hora_inicio || '08:00').split(':').map(Number);
  const [endH,   endM  ] = (cfg.hora_fim    || '18:00').split(':').map(Number);
  const startMin = startH * 60 + startM;
  const endMin   = endH   * 60 + endM;
  const dias = cfg.dias_semana || [1, 2, 3, 4, 5];

  let dt = new Date(proposedMs);

  for (let i = 0; i < 14; i++) {
    const brt    = new Date(dt.getTime() - 3 * 60 * 60 * 1000);
    const jsDow  = brt.getUTCDay();
    const ourDow = jsDow === 0 ? 7 : jsDow;
    const curMin = brt.getUTCHours() * 60 + brt.getUTCMinutes();

    if (dias.includes(ourDow)) {
      if (curMin >= startMin && curMin < endMin) return dt.toISOString(); // já na janela
      if (curMin < startMin) {
        // Mesmo dia válido, antes do início → empurra para hora_inicio
        brt.setUTCHours(startH, startM, 0, 0);
        return new Date(brt.getTime() + 3 * 60 * 60 * 1000).toISOString();
      }
    }
    // Após o fim da janela ou dia inválido → próximo dia em hora_inicio
    brt.setUTCDate(brt.getUTCDate() + 1);
    brt.setUTCHours(startH, startM, 0, 0);
    dt = new Date(brt.getTime() + 3 * 60 * 60 * 1000);
  }
  return dt.toISOString();
}

function randomDelayMs(minMin, maxMin) {
  const minMs = (minMin || 1)  * 60 * 1000;
  const maxMs = (maxMin || 30) * 60 * 1000;
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    return await run(req);
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, fatal: err.message }), {
      status: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
}

async function run(req) {
  const secret = process.env.DISPARO_CRON_SECRET;
  if (secret && req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), {
      status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const respond = (data) => new Response(JSON.stringify(data), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

  const cfgArr = await dbSelect('disparo_config', 'limit=1');
  if (!cfgArr?.length) return respond({ ok: true, skipped: 'configuração não encontrada' });
  const cfg = cfgArr[0];

  // Sem bloqueio global de janela horária — campanhas começam imediatamente ao serem
  // ativadas. A janela (hora_inicio/hora_fim) é usada apenas para agendar o PRÓXIMO
  // item após cada envio bem-sucedido, via nextWindowSlot().

  const nowIso = new Date().toISOString();
  const today  = todayBRT();

  const campanhas = await dbSelect('disparo_campanhas', 'status=eq.ativa');
  if (!campanhas?.length) return respond({ ok: true, skipped: 'nenhuma campanha ativa' });

  const results = [];

  for (const campanha of campanhas) {
    if (campanha.ultima_data !== today) {
      await dbPatch('disparo_campanhas', `id=eq.${campanha.id}`, { enviados_hoje: 0, ultima_data: today });
      campanha.enviados_hoje = 0;
    }

    if (campanha.enviados_hoje >= (cfg.max_por_dia || 50)) {
      results.push({ campanha_id: campanha.id, skipped: 'limite diário atingido' });
      continue;
    }

    const nowEnc = encodeURIComponent(nowIso);
    const items = await dbSelect(
      'disparo_fila',
      `campanha_id=eq.${campanha.id}&status=eq.pending&send_after=lte.${nowEnc}&order=send_after.asc&limit=1`,
      'id,campanha_id,nome,telefone'
    );

    if (!items?.length) {
      const pendingCount = await dbCount('disparo_fila', `campanha_id=eq.${campanha.id}&status=eq.pending`);
      if (pendingCount === 0) {
        await dbPatch('disparo_campanhas', `id=eq.${campanha.id}`, { status: 'concluida' });
        results.push({ campanha_id: campanha.id, completed: true });
      } else {
        results.push({ campanha_id: campanha.id, skipped: 'próximo envio agendado no futuro' });
      }
      continue;
    }

    const item = items[0];
    let sent = false;
    let erro = null;

    if (!cfg.webhook_url) {
      erro = 'Webhook URL não configurada';
    } else {
      try {
        let tel = (item.telefone || '').replace(/\D/g, '');
        if (tel.length === 10 || tel.length === 11) tel = '55' + tel;

        const res = await fetch(cfg.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cliente: item.nome || '', telefone: tel }),
        });
        sent = res.ok;
        if (!sent) erro = `HTTP ${res.status}`;
      } catch (e) {
        erro = e.message;
      }
    }

    await dbPatch('disparo_fila', `id=eq.${item.id}`, {
      status: sent ? 'sent' : 'failed',
      sent_at: nowIso,
      erro: erro || null,
    });

    if (sent) {
      await dbPatch('disparo_campanhas', `id=eq.${campanha.id}`, {
        enviados_hoje:  campanha.enviados_hoje + 1,
        enviados_total: (campanha.enviados_total || 0) + 1,
        ultima_data:    today,
      });

      // Agenda próximo item no próximo slot válido da janela configurada
      const delayMs       = randomDelayMs(cfg.delay_min_min, cfg.delay_max_min);
      const nextSendAfter = nextWindowSlot(cfg, Date.now() + delayMs);
      const delayMin      = Math.round((new Date(nextSendAfter).getTime() - Date.now()) / 60000);

      const nextItems = await dbSelect(
        'disparo_fila',
        `campanha_id=eq.${campanha.id}&status=eq.pending&order=criado_em.asc&limit=1`,
        'id'
      );

      if (nextItems?.length) {
        await dbPatch('disparo_fila', `id=eq.${nextItems[0].id}`, { send_after: nextSendAfter });
      }

      results.push({ campanha_id: campanha.id, telefone: item.telefone, sent: true, proximo_em_min: delayMin });
    } else {
      await dbPatch('disparo_campanhas', `id=eq.${campanha.id}`, {
        falhas_total: (campanha.falhas_total || 0) + 1,
      });
      results.push({ campanha_id: campanha.id, telefone: item.telefone, sent: false, erro });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
