import { createClient } from '@supabase/supabase-js';

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

async function upsertClienteLocal(dados) {
  try {
    const telLimpo = (dados.telefone || '').replace(/\D/g, '') || null;
    const cpfLimpo = (dados.cpfCnpj || '').replace(/\D/g, '') || null;
    const agora = new Date().toISOString();

    let clienteExistente = null;

    if (cpfLimpo) {
      const { data } = await supabaseAdmin
        .from('clientes')
        .select('id, total_compras, total_gasto, data_primeira_compra')
        .eq('cpf_cnpj', cpfLimpo)
        .maybeSingle();
      clienteExistente = data;
    }

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
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // 1. POST: Salvar dados de cadastro (antiga lógica do submit-cadastro.js)
  if (req.method === 'POST') {
    const dados = req.body;
    if (!dados || !dados.nomeCompleto) {
      return res.status(400).json({ ok: false, error: 'Dados incompletos.' });
    }

    const telLimpo = (dados.telefone || '').replace(/\D/g, '');
    const cpfLimpo = (dados.cpfCnpj || '').replace(/\D/g, '');

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

    await upsertClienteLocal({ ...dados, telefone: telLimpo, cpfCnpj: cpfLimpo });

    let blingOk = false;
    let blingErro = '';
    let blingStatus = null;
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
      blingStatus = resBling?.status;
      const blingBody = await resBling?.text?.() || '';
      blingOk = resBling?.ok || blingStatus === 200 || blingStatus === 201;
      if (!blingOk) blingErro = blingBody || 'Erro desconhecido';
    } catch (e) {
      blingErro = e.message;
    }

    return res.status(200).json({
      ok: true,
      bling: { ok: blingOk, erro: blingErro || undefined, status: blingStatus },
      mensagem: 'Cadastro realizado com sucesso!',
    });
  }

  // 2. GET: Renderizar HTML de cadastro e redirecionar
  if (req.method === 'GET') {
    const baseUrl = `https://${req.headers.host}`;
    const redirectUrl = `${baseUrl}/formulario-cadastro`;
    const ogImageUrl = `${baseUrl}/og.png`;

    const html = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Brave — Cadastro de Cliente</title>
        <meta property="og:title" content="Brave — Cadastro de Cliente" />
        <meta property="og:description" content="Cadastre seus dados para receber propostas e suporte da Brave Fitness Equipment." />
        <meta property="og:image" content="${ogImageUrl}" />
        <meta property="og:url" content="${baseUrl}/cadastro" />
        <meta property="og:type" content="website" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:site_name" content="Brave Fitness Equipment" />
        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="Brave — Cadastro de Cliente">
        <meta name="twitter:description" content="Cadastre seus dados para receber propostas e suporte da Brave Fitness Equipment.">
        <meta name="twitter:image" content="${ogImageUrl}">
        <meta http-equiv="refresh" content="0; url=${redirectUrl}">
        <script>window.location.replace("${redirectUrl}");</script>
        <style>
          body { background:#0a0a0a; display:flex; justify-content:center; align-items:center; height:100vh; margin:0; font-family:sans-serif; }
          .loader { border:3px solid #27272a; border-top:3px solid #f97316; border-radius:50%; width:36px; height:36px; animation:spin 0.8s linear infinite; }
          @keyframes spin { to { transform:rotate(360deg); } }
        </style>
      </head>
      <body>
        <div style="text-align:center;">
          <div class="loader" style="margin:0 auto 16px;"></div>
          <p style="color:#d4d4d8;font-size:14px;">Abrindo formulário...</p>
          <p style="font-size:11px;color:#52525b;margin-top:8px;">Se não redirecionar, <a href="${redirectUrl}" style="color:#f97316;text-decoration:none;">clique aqui</a>.</p>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(html);
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
