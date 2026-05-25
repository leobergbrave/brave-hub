import { createClient } from '@supabase/supabase-js';

export const config = { runtime: 'edge' };

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function getSupabase() {
  return createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Aceita telefone em vários formatos vindos do BotConversa
  const telefoneRaw = body.telefone || body.phone || body.contact?.phone || '';
  const resposta    = body.resposta || body.tipo || '';

  if (!telefoneRaw || !resposta) {
    return new Response(JSON.stringify({ error: 'telefone e resposta são obrigatórios' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  const RESPOSTAS_VALIDAS = ['aceitou', 'optout', 'sem_resposta'];
  if (!RESPOSTAS_VALIDAS.includes(resposta)) {
    return new Response(JSON.stringify({ error: `resposta deve ser: ${RESPOSTAS_VALIDAS.join(', ')}` }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  // Normaliza telefone: remove não-dígitos
  let tel = telefoneRaw.replace(/\D/g, '');
  // Remove DDI 55 para buscar nos contatos (que podem estar com ou sem)
  const telSemDDI = tel.startsWith('55') && tel.length > 11 ? tel.slice(2) : tel;

  const supabase = getSupabase();

  // Busca o item mais recente da fila com esse telefone (status sent)
  const { data: items } = await supabase
    .from('disparo_fila')
    .select('id, campanha_id')
    .eq('status', 'sent')
    .or(`telefone.eq.${tel},telefone.eq.${telSemDDI},telefone.eq.55${telSemDDI}`)
    .order('sent_at', { ascending: false })
    .limit(1);

  if (!items?.length) {
    // Tenta também entre os pending (caso resposta chegue antes do envio ser registrado)
    const { data: pending } = await supabase
      .from('disparo_fila')
      .select('id, campanha_id')
      .or(`telefone.eq.${tel},telefone.eq.${telSemDDI},telefone.eq.55${telSemDDI}`)
      .order('criado_em', { ascending: false })
      .limit(1);

    if (!pending?.length) {
      return new Response(JSON.stringify({ ok: false, msg: 'Contato não encontrado na fila' }), {
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    items?.push(...(pending || []));
  }

  const item = items[0];
  const agora = new Date().toISOString();

  // Atualiza a resposta no item da fila
  await supabase.from('disparo_fila')
    .update({ resposta, respondeu_em: agora })
    .eq('id', item.id);

  // Se optout: marca o contato como não quer receber (campo optout na tabela contatos)
  if (resposta === 'optout') {
    await supabase.from('contatos')
      .update({ optout: true, optout_em: agora })
      .or(`telefone.eq.${tel},telefone.eq.${telSemDDI},telefone.eq.55${telSemDDI}`);
  }

  return new Response(JSON.stringify({ ok: true, campanha_id: item.campanha_id, resposta }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
