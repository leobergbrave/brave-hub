export const config = { runtime: 'edge' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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
  if (!r.ok) throw new Error(`GET ${table}: ${r.status}`);
  return r.json();
}

async function dbPatch(table, filter, data) {
  const r = await fetch(`${sbBase()}/${table}?${filter}`, {
    method: 'PATCH',
    headers: sbHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`PATCH ${table}: ${r.status}`);
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }

  // BotConversa envolve payload em { root: { ... } }
  const payload = body.root || body;
  const telefoneRaw = payload.telefone || payload.phone || payload.contact?.phone || '';

  const tel = telefoneRaw.replace(/\D/g, '');
  if (tel.length < 10) {
    return json({ ok: true, updated: false, msg: 'Telefone inválido ou variável não substituída' });
  }

  const telComDDI = tel.startsWith('55') ? tel : `55${tel}`;
  const telSemDDI = tel.startsWith('55') && tel.length > 11 ? tel.slice(2) : tel;
  const agora = new Date().toISOString();

  try {
    const orFilter = `or=(telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI})`;
    const leads = await dbSelect(
      'leads',
      `${orFilter}&status=in.(novo,fluxo_disparado)&order=criado_em.desc&limit=1`,
      'id'
    );

    if (!leads?.length) {
      return json({ ok: true, updated: false, msg: 'Lead não encontrado ou já avançado' });
    }

    await dbPatch('leads', `id=eq.${leads[0].id}`, { status: 'respondeu', respondeu_em: agora });
    return json({ ok: true, lead_id: leads[0].id, telefone: tel });

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
