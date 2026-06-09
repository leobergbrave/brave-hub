import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/sincronizar-contato-bling
 * Cria ou atualiza o contato do cliente no Bling a partir dos dados do Supabase.
 * Body: { clienteId }
 */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getBlingConfig() {
  const { data, error } = await supabaseAdmin.from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) return null;
  return data;
}

async function refreshBlingToken(config) {
  const credentials = Buffer.from(`${config.client_id}:${config.client_secret}`).toString('base64');
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: config.refresh_token }),
  });
  if (!response.ok) return null;
  const tokenData = await response.json();
  await supabaseAdmin.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return tokenData.access_token;
}

async function getValidToken() {
  const config = await getBlingConfig();
  if (!config) return null;
  const testRes = await fetch('https://api.bling.com.br/v3/contatos?limite=1', {
    headers: { Authorization: `Bearer ${config.access_token}`, Accept: '1.0' },
  });
  if (testRes.status === 401) return await refreshBlingToken(config);
  return config.access_token;
}

async function blingRequest(url, method, body, token) {
  return fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: '1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { clienteId } = req.body || {};
  if (!clienteId) {
    return res.status(400).json({ ok: false, error: 'clienteId é obrigatório.' });
  }

  const { data: cliente, error: errCliente } = await supabaseAdmin
    .from('clientes').select('*').eq('id', clienteId).single();
  if (errCliente || !cliente) {
    return res.status(404).json({ ok: false, error: 'Cliente não encontrado.' });
  }

  const token = await getValidToken();
  if (!token) {
    return res.status(200).json({ ok: false, error: 'Sem token Bling. Reconecte nas configurações.' });
  }

  const df = cliente.dados_fiscais || {};
  // CPF: priority to clientes.cpf_cnpj, fallback to dados_fiscais.cpfCnpj (set when fiscal form is submitted)
  const cpfLimpo = (
    (cliente.cpf_cnpj || '').replace(/\D/g, '') ||
    (df.cpfCnpj || '').replace(/\D/g, '')
  );
  const isPJ = (cliente.tipo_pessoa || df.tipoPessoa || 'F') === 'J';

  // Buscar contato existente no Bling por CPF/CNPJ
  let contatoId = null;
  if (cpfLimpo) {
    await sleep(300);
    const searchRes = await blingRequest(
      `https://api.bling.com.br/v3/contatos?cpf_cnpj=${cpfLimpo}`, 'GET', null, token
    );
    if (searchRes?.ok) {
      const j = await searchRes.json();
      const match = (j.data || []).find(c => {
        const doc = (c.numeroDocumento || c.cpfCnpj || c.cpf || c.cnpj || '').replace(/\D/g, '');
        return doc === cpfLimpo;
      });
      contatoId = match?.id || null;
    }
  }

  // Fallback: buscar por email
  if (!contatoId && cliente.email) {
    await sleep(300);
    const emailRes = await blingRequest(
      `https://api.bling.com.br/v3/contatos?email=${encodeURIComponent(cliente.email)}`, 'GET', null, token
    );
    if (emailRes?.ok) {
      const j = await emailRes.json();
      const emailLower = (cliente.email || '').toLowerCase();
      const match = (j.data || []).find(c => (c.email || '').toLowerCase() === emailLower);
      if (match) contatoId = match.id;
    }
  }

  const contatoPayload = {
    nome: cliente.nome,
    tipo: isPJ ? 'J' : 'F',
    situacao: 'A',
    email: cliente.email || '',
    emailNotaFiscal: cliente.email || '',
    telefone: cliente.telefone || '',
    celular: cliente.telefone || '',
    ...(cpfLimpo ? { cpfCnpj: cpfLimpo } : {}),
    ...(isPJ
      ? { fantasia: df.nomeFantasia || '', ie: df.inscricaoEstadual || '' }
      : { dataNascimento: df.dataNascimento || '' }),
    endereco: {
      endereco: df.logradouro || '',
      numero: df.numero || '',
      complemento: df.complemento || '',
      bairro: df.bairro || '',
      municipio: df.cidade || '',
      uf: df.estado || '',
      cep: (df.cep || '').replace(/\D/g, ''),
      pais: 'Brasil',
    },
  };

  await sleep(300);
  let blingContatoId = contatoId;
  if (contatoId) {
    const updRes = await blingRequest(
      `https://api.bling.com.br/v3/contatos/${contatoId}`, 'PUT', contatoPayload, token
    );
    const body = await updRes?.text?.() || '';
    console.log('[sincronizar-contato] PUT', contatoId, 'status:', updRes?.status, body.slice(0, 200));
    if (!updRes?.ok) {
      return res.status(200).json({ ok: false, error: `Erro ao atualizar contato (${updRes?.status}): ${body}` });
    }
  } else {
    const createRes = await blingRequest(
      'https://api.bling.com.br/v3/contatos', 'POST', contatoPayload, token
    );
    const body = await createRes?.text?.() || '';
    console.log('[sincronizar-contato] POST status:', createRes?.status, body.slice(0, 300));
    if (!createRes?.ok) {
      return res.status(200).json({ ok: false, error: `Erro ao criar contato (${createRes?.status}): ${body}` });
    }
    try { blingContatoId = JSON.parse(body).data?.id || null; } catch (_) {}
  }

  return res.status(200).json({
    ok: true,
    contatoId: blingContatoId,
    acao: contatoId ? 'atualizado' : 'criado',
  });
}
