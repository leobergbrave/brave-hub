import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * submit-dados-fiscais
 * Recebe os dados fiscais preenchidos pelo cliente via formulário público,
 * salva no orcamento_salvo e cria/atualiza o contato no Bling.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getBlingConfig(supabase: any) {
  const { data, error } = await supabase
    .from('bling_config')
    .select('*')
    .eq('id', 1)
    .single();
  if (error || !data) return null;
  return data;
}

async function refreshBlingToken(supabase: any, config: any): Promise<string> {
  const credentials = btoa(`${config.client_id}:${config.client_secret}`);
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: '1.0',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token,
    }),
  });
  if (!response.ok) throw new Error('Falha ao renovar token Bling.');
  const tokenData = await response.json();
  await supabase.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString(),
  }).eq('id', 1);
  return tokenData.access_token;
}

async function fetchWithBlingAuth(url: string, method: string, body: any, supabase: any) {
  const config = await getBlingConfig(supabase);
  if (!config) throw new Error('Configuração Bling não encontrada.');

  const doFetch = (token: string) => fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: '1.0',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let res = await doFetch(config.access_token);
  if (res.status === 401) {
    const newToken = await refreshBlingToken(supabase, config);
    res = await doFetch(newToken);
  }
  return res;
}

/**
 * Monta o payload de contato para a API Bling v3
 */
function montarContatoBling(dados: any, nomeCliente: string) {
  const isPJ = dados.tipoPessoa === 'J';

  const contato: any = {
    nome: dados.nomeCompleto || nomeCliente,
    tipoPessoa: dados.tipoPessoa || 'F',
    email: dados.email || '',
    telefone: dados.telefone || '',
    celular: dados.celular || dados.telefone || '',
    cpfCnpj: (dados.cpfCnpj || '').replace(/\D/g, ''),
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

  if (isPJ) {
    contato.fantasia = dados.nomeFantasia || '';
    contato.ie = dados.inscricaoEstadual || '';
  } else {
    contato.dataNascimento = dados.dataNascimento || '';
  }

  return contato;
}

/**
 * Cria ou atualiza contato no Bling.
 * Primeiro tenta buscar por CPF/CNPJ existente.
 */
async function upsertContatoBling(dados: any, nomeCliente: string, supabase: any): Promise<{ ok: boolean; contatoId?: number; erro?: string }> {
  const cpfCnpj = (dados.cpfCnpj || '').replace(/\D/g, '');
  const payload = montarContatoBling(dados, nomeCliente);

  // Buscar contato existente por CPF/CNPJ
  if (cpfCnpj) {
    await sleep(300);
    const resBusca = await fetchWithBlingAuth(
      `https://api.bling.com.br/v3/contatos?cpf_cnpj=${cpfCnpj}`,
      'GET', null, supabase,
    );
    if (resBusca.ok) {
      const jsonBusca = await resBusca.json();
      const existente = (jsonBusca.data || [])[0];
      if (existente?.id) {
        // Atualizar contato existente
        await sleep(300);
        const resUpdate = await fetchWithBlingAuth(
          `https://api.bling.com.br/v3/contatos/${existente.id}`,
          'PUT', payload, supabase,
        );
        if (resUpdate.ok || resUpdate.status === 200) {
          return { ok: true, contatoId: existente.id };
        }
      }
    }
  }

  // Criar novo contato
  await sleep(300);
  const resCria = await fetchWithBlingAuth(
    'https://api.bling.com.br/v3/contatos',
    'POST', payload, supabase,
  );

  if (!resCria.ok) {
    const errText = await resCria.text();
    return { ok: false, erro: `Erro ao criar contato Bling: ${errText}` };
  }

  const jsonCria = await resCria.json();
  const contatoId = jsonCria.data?.id;
  return { ok: true, contatoId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const body = await req.json();
    const { token, dadosFiscais } = body;

    if (!token || !dadosFiscais) {
      return new Response(JSON.stringify({ ok: false, error: 'Token e dadosFiscais são obrigatórios.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400,
      });
    }

    // Buscar o orcamento pelo token
    const { data: orc, error: errOrc } = await supabase
      .from('orcamentos_salvos')
      .select('id, cliente, payload, bling_pedido_id, dados_fiscais_recebidos_em, cliente_id')
      .eq('formulario_fiscal_token', token)
      .maybeSingle();

    if (errOrc || !orc) {
      return new Response(JSON.stringify({ ok: false, error: 'Link inválido ou expirado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404,
      });
    }

    // Salvar dados fiscais no payload do orcamento
    const novoPayload = { ...(orc.payload || {}), dadosFiscais };
    const { error: errUpdate } = await supabase
      .from('orcamentos_salvos')
      .update({
        payload: novoPayload,
        dados_fiscais_recebidos_em: new Date().toISOString(),
      })
      .eq('id', orc.id);

    if (errUpdate) {
      return new Response(JSON.stringify({ ok: false, error: errUpdate.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
      });
    }

    // Persistir CPF e dados fiscais de volta ao cliente (evita perda nas próximas sincronizações com Bling)
    if (orc.cliente_id) {
      const cpfCnpj = (dadosFiscais.cpfCnpj || '').replace(/\D/g, '') || null;
      await supabase.from('clientes').update({
        ...(cpfCnpj ? { cpf_cnpj: cpfCnpj } : {}),
        tipo_pessoa: dadosFiscais.tipoPessoa || 'F',
        dados_fiscais: dadosFiscais,
        atualizado_em: new Date().toISOString(),
      }).eq('id', orc.cliente_id);
    }

    // Criar/atualizar contato no Bling
    let blingResult: { ok: boolean; contatoId?: number; erro?: string } = { ok: false };
    try {
      blingResult = await upsertContatoBling(dadosFiscais, orc.cliente, supabase);
    } catch (e: any) {
      blingResult = { ok: false, erro: e.message };
    }

    return new Response(JSON.stringify({
      ok: true,
      bling: blingResult,
      mensagem: 'Dados fiscais salvos com sucesso!',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });

  } catch (error: any) {
    console.error('Erro no submit-dados-fiscais:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500,
    });
  }
});
