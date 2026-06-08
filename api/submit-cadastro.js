import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/submit-cadastro
 * Salva dados do cliente no Supabase (leads + clientes) e cria contato no Bling.
 */

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getBlingToken() {
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

async function blingFetch(url, method, body) {
  const config = await getBlingToken();
  if (!config) return null;
  const doFetch = (token) => fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: '1.0' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let res = await doFetch(config.access_token);
  if (res.status === 401) {
    const newToken = await refreshBlingToken(config);
    if (newToken) res = await doFetch(newToken);
  }
  return res;
}

// Upsert inline na tabela clientes (sem import externo)
async function upsertClienteLocal(dados) {
  try {
    const telLimpo = (dados.telefone || '').replace(/\D/g, '') || null;
    const cpfLimpo = (dados.cpfCnpj || '').replace(/\D/g, '') || null;
    const agora = new Date().toISOString();

    let clienteExistente = null;

    // Buscar por CPF/CNPJ primeiro
    if (cpfLimpo) {
      const { data } = await supabaseAdmin
        .from('clientes')
        .select('id, total_compras, total_gasto, data_primeira_compra')
        .eq('cpf_cnpj', cpfLimpo)
        .maybeSingle();
      clienteExistente = data;
    }

    // Fallback por telefone
    if (!clienteExistente && telLimpo) {
      const { data } = await supabaseAdmin
        .from('clientes')
        .select('id, total_compras, total_gasto, data_primeira_compra')
        .eq('telefone', telLimpo)
        .maybeSingle();
      clienteExistente = data;
    }

    const dadosFiscais = {
      dataNascimento: dados.dataNascimento,
      nomeFantasia: dados.nomeFantasia,
      inscricaoEstadual: dados.inscricaoEstadual,
      logradouro: dados.logradouro,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      cidade: dados.cidade,
      estado: dados.estado,
      cep: dados.cep,
    };

    if (clienteExistente) {
      await supabaseAdmin.from('clientes').update({
        nome: dados.nomeCompleto,
        ...(telLimpo && { telefone: telLimpo }),
        ...(dados.email && { email: dados.email }),
        ...(cpfLimpo && { cpf_cnpj: cpfLimpo }),
        ...(dados.tipoPessoa && { tipo_pessoa: dados.tipoPessoa }),
        ...(dados.tipoNegocio && { tipo_negocio: dados.tipoNegocio }),
        dados_fiscais: dadosFiscais,
        atualizado_em: agora,
      }).eq('id', clienteExistente.id);
    } else {
      await supabaseAdmin.from('clientes').insert({
        nome: dados.nomeCompleto,
        telefone: telLimpo,
        email: dados.email || null,
        cpf_cnpj: cpfLimpo,
        tipo_pessoa: dados.tipoPessoa || 'F',
        tipo_negocio: dados.tipoNegocio || null,
        dados_fiscais: dadosFiscais,
        origem: 'cadastro_web',
        total_compras: 0,
        total_gasto: 0,
        criado_em: agora,
        atualizado_em: agora,
      });
    }
  } catch (e) {
    console.error('[upsertCliente] Erro:', e.message);
    // Não propaga — cadastro continua mesmo se clientes falhar
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const dados = req.body;
  if (!dados || !dados.nomeCompleto) {
    return res.status(400).json({ ok: false, error: 'Dados incompletos.' });
  }

  const telLimpo = (dados.telefone || '').replace(/\D/g, '');
  const cpfLimpo = (dados.cpfCnpj || '').replace(/\D/g, '');

  // 1. Salvar no Supabase (tabela leads)
  try {
    await supabaseAdmin.from('leads').insert({
      nome: dados.nomeCompleto,
      telefone: telLimpo,
      status: 'novo',
      origem_lead: 'cadastro_web',
    });
  } catch (e) {
    console.error('[leads insert] Erro:', e.message);
  }

  // 2. Upsert na tabela clientes
  await upsertClienteLocal({ ...dados, telefone: telLimpo, cpfCnpj: cpfLimpo });

  // 3. Criar/atualizar contato no Bling
  let blingOk = false;
  let blingErro = '';
  try {
    const isPJ = dados.tipoPessoa === 'J';
    let contatoId = null;
    if (cpfLimpo) {
      await sleep(300);
      const resBusca = await blingFetch(`https://api.bling.com.br/v3/contatos?cpf_cnpj=${cpfLimpo}`, 'GET', null);
      if (resBusca?.ok) {
        const j = await resBusca.json();
        const match = (j.data || []).find(c => {
          const docBling = (c.numeroDocumento || c.cpfCnpj || c.cpf || c.cnpj || '').replace(/\D/g, '');
          return docBling === cpfLimpo;
        });
        contatoId = match?.id || null;
      }
    }
    const payload = {
      nome: dados.nomeCompleto,
      tipo: dados.tipoPessoa === 'J' ? 'J' : 'F',
      situacao: 'A',
      email: dados.email || '',
      emailNotaFiscal: dados.email || '',
      telefone: telLimpo,
      celular: telLimpo,
      ...(cpfLimpo ? { cpfCnpj: cpfLimpo } : {}),
      ...(isPJ
        ? { fantasia: dados.nomeFantasia || '', ie: dados.inscricaoEstadual || '' }
        : { dataNascimento: dados.dataNascimento || '' }),
      endereco: {
        endereco: dados.logradouro || '',
        numero: dados.numero || '',
        complemento: dados.complemento || '',
        bairro: dados.bairro || '',
        municipio: dados.cidade || '',
        uf: dados.estado || '',
        cep: (dados.cep || '').replace(/\D/g, ''),
        pais: 'Brasil',
      },
    };
    await sleep(300);
    const resBling = contatoId
      ? await blingFetch(`https://api.bling.com.br/v3/contatos/${contatoId}`, 'PUT', payload)
      : await blingFetch('https://api.bling.com.br/v3/contatos', 'POST', payload);
    const blingStatus = resBling?.status;
    const blingBody = await resBling?.text?.() || '';
    blingOk = resBling?.ok || blingStatus === 200 || blingStatus === 201;
    if (!blingOk) blingErro = blingBody || 'Erro desconhecido';
    console.log('[Bling contato]', { ok: blingOk, status: blingStatus, contatoId, body: blingBody.slice(0, 500) });
  } catch (e) {
    blingErro = e.message;
  }

  return res.status(200).json({
    ok: true,
    bling: { ok: blingOk, erro: blingErro || undefined, status: blingStatus },
    mensagem: 'Cadastro realizado com sucesso!',
  });
}
