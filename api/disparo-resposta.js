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

  const payload = body.root || body;

  const telefoneRaw = payload.telefone || payload.phone || payload.contact?.phone || '';
  const resposta    = payload.resposta || payload.tipo || '';

  const VALIDAS = ['aceitou', 'optout', 'sem_resposta'];
  if (!VALIDAS.includes(resposta)) return json({ error: `resposta deve ser: ${VALIDAS.join(', ')}` }, 400);

  const tel = telefoneRaw.replace(/\D/g, '');
  if (tel.length < 10) {
    return json({ ok: false, msg: 'Telefone inválido ou não substituído pelo BotConversa' }, 200);
  }

  const telComDDI = tel.startsWith('55') ? tel : `55${tel}`;
  const telSemDDI = tel.startsWith('55') && tel.length > 11 ? tel.slice(2) : tel;

  try {
    const buscarFila = async (statusFilter) => {
      let qs = `or=(telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI})&order=criado_em.desc&limit=1`;
      if (statusFilter) qs += `&status=eq.${statusFilter}`;
      return dbSelect('disparo_fila', qs, 'id,campanha_id');
    };

    let items = await buscarFila('sent');
    if (!items?.length) items = await buscarFila(null);

    if (!items?.length) {
      return json({ ok: false, msg: 'Contato não encontrado na fila de disparos' });
    }

    const item  = items[0];
    const agora = new Date().toISOString();

    await dbPatch('disparo_fila', `id=eq.${item.id}`, { resposta, respondeu_em: agora });

    if (resposta === 'optout') {
      const orFilter = `or=(telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI})`;
      await dbPatch('contatos', orFilter, { optout: true, optout_em: agora });
    }

    // Avança o lead para "respondeu" quando responde positivamente à campanha
    if (resposta === 'aceitou') {
      const orFilter = `or=(telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI})`;
      const leadItems = await dbSelect('leads', `${orFilter}&status=in.(novo,fluxo_disparado)&order=criado_em.desc&limit=1`, 'id');
      if (leadItems?.length) {
        await dbPatch('leads', `id=eq.${leadItems[0].id}`, { status: 'respondeu', respondeu_em: agora });
      }
    }

    return json({ ok: true, campanha_id: item.campanha_id, resposta, telefone: tel });

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
