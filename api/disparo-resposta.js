import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: 'Body inválido' }, 400); }

  // BotConversa pode enviar em body.root ou direto
  const payload = body.root || body;

  const telefoneRaw = payload.telefone || payload.phone || payload.contact?.phone || '';
  const resposta    = payload.resposta || payload.tipo || '';

  const VALIDAS = ['aceitou', 'optout', 'sem_resposta'];
  if (!VALIDAS.includes(resposta)) return json({ error: `resposta deve ser: ${VALIDAS.join(', ')}` }, 400);

  // Normaliza e valida telefone (mínimo 10 dígitos)
  const tel = telefoneRaw.replace(/\D/g, '');
  if (tel.length < 10) {
    // Telefone inválido ou variável não substituída (ex: "{telefone}" enviado no teste manual)
    return json({ ok: false, msg: 'Telefone inválido ou não substituído pelo BotConversa' }, 200);
  }

  // Gera variações para busca (com/sem DDI 55)
  const telComDDI  = tel.startsWith('55') ? tel : `55${tel}`;
  const telSemDDI  = tel.startsWith('55') && tel.length > 11 ? tel.slice(2) : tel;

  const supabase = getSupabase();

  try {
    // Busca item da fila pelo telefone (sent primeiro, depois qualquer status)
    const buscarFila = async (status) => {
      let q = supabase
        .from('disparo_fila')
        .select('id, campanha_id')
        .or(`telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI}`)
        .order('criado_em', { ascending: false })
        .limit(1);
      if (status) q = q.eq('status', status);
      const { data } = await q;
      return data;
    };

    let items = await buscarFila('sent');
    if (!items?.length) items = await buscarFila(null);

    if (!items?.length) {
      return json({ ok: false, msg: 'Contato não encontrado na fila de disparos' });
    }

    const item  = items[0];
    const agora = new Date().toISOString();

    await supabase.from('disparo_fila')
      .update({ resposta, respondeu_em: agora })
      .eq('id', item.id);

    if (resposta === 'optout') {
      await supabase.from('contatos')
        .update({ optout: true, optout_em: agora })
        .or(`telefone.eq.${tel},telefone.eq.${telComDDI},telefone.eq.${telSemDDI}`);
    }

    return json({ ok: true, campanha_id: item.campanha_id, resposta, telefone: tel });

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
