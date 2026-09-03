import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getBlingToken(supabase: any) {
  const { data, error } = await supabase.from('bling_config').select('*').eq('id', 1).single();
  if (error || !data) throw new Error('Credenciais da Bling não encontradas no banco.');
  return data;
}

async function refreshBlingToken(supabase: any, config: any) {
  const credentials = btoa(`${config.client_id}:${config.client_secret}`);
  
  const response = await fetch('https://www.bling.com.br/Api/v3/oauth/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': '1.0'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.refresh_token
    })
  });

  if (!response.ok) {
    const err = await response.text();
    console.error('Erro ao atualizar token:', err);
    throw new Error('Falha ao renovar o token da Bling. O refresh_token pode ter expirado.');
  }

  const tokenData = await response.json();
  
  await supabase.from('bling_config').update({
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    updated_at: new Date().toISOString()
  }).eq('id', 1);

  return tokenData.access_token;
}

async function fetchWithBlingAuth(url: string, options: any, supabase: any) {
  let config = await getBlingToken(supabase);
  
  let res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${config.access_token}`,
      'Accept': '1.0'
    }
  });

  if (res.status === 401) {
    console.log('Token expirado. Tentando renovar...');
    const newAccessToken = await refreshBlingToken(supabase, config);
    res = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${newAccessToken}`,
        'Accept': '1.0'
      }
    });
  }

  return res;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const body = await req.json();
    const { cliente, consultor, payload, clienteId } = body;

    if (!payload || !payload.itens) {
      return new Response(JSON.stringify({ error: 'Payload de orçamento inválido' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      });
    }

    const nomeCliente = cliente || 'Cliente Brave HUB';
    const nomeConsultor = consultor || 'Léo Berg';
    const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    // 1. Buscar Vendedor
    //
    // Cuidado: a versao antiga casava com `normConsultor.includes(normVend)`, o que
    // dava match em QUALQUER vendedor de nome vazio/curto ("leo berg".includes("") e
    // true) — e o .find() pegava o primeiro da lista. Quando nada casava, nenhum
    // vendedor era enviado e o Bling atribuia o padrao da conta. Nos dois casos a
    // proposta saia no nome errado.
    //
    // Agora: BLING_VENDEDOR_ID (se definido) manda, sem adivinhacao. Senao, match
    // exato pelo nome; e so entao um parcial seguro (ambos com >= 3 letras e
    // resultado unico).
    let idVendedor: any = undefined;
    let vendedorNome: string | null = null;

    const idFixo = Deno.env.get('BLING_VENDEDOR_ID');
    if (idFixo) {
      idVendedor = isNaN(Number(idFixo)) ? idFixo : Number(idFixo);
      vendedorNome = `(fixo por BLING_VENDEDOR_ID=${idFixo})`;
    } else {
      const resVend = await fetchWithBlingAuth('https://api.bling.com.br/v3/vendedores', { method: 'GET' }, supabaseClient);
      if (resVend.ok) {
        const vendData = await resVend.json();
        const lista = (vendData?.data || []).filter((v: any) => (v?.contato?.nome || '').trim());
        const alvo = normalize(nomeConsultor);

        let vendedor = lista.find((v: any) => normalize(v.contato.nome) === alvo);

        if (!vendedor && alvo.length >= 3) {
          const parciais = lista.filter((v: any) => {
            const n = normalize(v.contato.nome);
            return n.length >= 3 && (n.includes(alvo) || alvo.includes(n));
          });
          if (parciais.length === 1) vendedor = parciais[0]; // so aceita se for inequivoco
        }

        if (vendedor) { idVendedor = vendedor.id; vendedorNome = vendedor.contato.nome; }
        else console.warn(`[sync-bling-proposal] vendedor "${nomeConsultor}" nao encontrado no Bling — a proposta sairia com o vendedor padrao da conta.`);
      }
    }
    
    await sleep(400); // Evitar rate limit (max 3 req/sec)

    // 2. Buscar ou Criar Contato — enriquecido com o cadastro local do cliente
    // (CPF/CNPJ, telefone, email e endereço), no formato da API v3:
    // documento em numeroDocumento e endereço aninhado em endereco.geral.
    let cliLocal: any = null;
    try {
      // clienteId direto (gerador com cliente vinculado) elimina a adivinhação
      // por telefone/nome — o contato Bling sai com os dados exatos do cadastro.
      if (clienteId) {
        const { data } = await supabaseClient.from('clientes').select('*').eq('id', clienteId).maybeSingle();
        cliLocal = data;
      }
      const telCli = String(payload?.telefoneCliente || '').replace(/\D/g, '');
      if (!cliLocal && telCli.length >= 10) {
        const { data } = await supabaseClient.from('clientes').select('*').eq('telefone', telCli).maybeSingle();
        cliLocal = data;
      }
      if (!cliLocal) {
        const { data } = await supabaseClient.from('clientes').select('*').ilike('nome', nomeCliente).maybeSingle();
        cliLocal = data;
      }
    } catch (_) { /* segue sem enriquecimento */ }

    const dfCli = cliLocal?.dados_fiscais || {};
    const docCli = String(cliLocal?.cpf_cnpj || dfCli.cpfCnpj || '').replace(/\D/g, '');
    // O Bling valida o documento contra o tipo: CPF (11) exige F, CNPJ (14) exige J.
    // Documento com tamanho invalido e descartado — senao a criacao do contato falha.
    const tipoDoc = docCli.length === 14 ? 'J' : docCli.length === 11 ? 'F' : null;
    const cpfCli = tipoDoc ? docCli : '';
    const tipoCli = tipoDoc || ((cliLocal?.tipo_pessoa || dfCli.tipoPessoa || 'F') === 'J' ? 'J' : 'F');
    const isPJCli = tipoCli === 'J';
    const endCli = {
      endereco: dfCli.logradouro || '',
      numero: dfCli.numero || '',
      complemento: dfCli.complemento || '',
      bairro: dfCli.bairro || '',
      municipio: dfCli.cidade || '',
      uf: dfCli.estado || '',
      cep: String(dfCli.cep || '').replace(/\D/g, ''),
    };

    // Busca do contato: documento → nome.
    // CUIDADO: a v3 IGNORA o filtro ?cpf_cnpj= (documento inexistente devolve a
    // primeira pagina inteira). Os filtros validos sao numeroDocumento e pesquisa.
    // Era por isso que o contato existente nunca era achado e a criacao falhava
    // com "O CPF ja esta cadastrado no contato X".
    const listarContatos = async (query: string) => {
      try {
        const r = await fetchWithBlingAuth(`https://api.bling.com.br/v3/contatos?${query}&limite=100`, { method: 'GET' }, supabaseClient);
        if (!r.ok) return [];
        const j = await r.json();
        return j?.data || [];
      } catch (_) { return []; }
    };

    // Payload do contato — montado antes da busca para servir tanto a criacao
    // quanto a ATUALIZACAO de um contato ja existente (o que faltava: cliente ja
    // cadastrado no Bling ficava sem CNPJ e sem numero do endereco porque a
    // funcao so preenchia esses campos ao CRIAR).
    const contatoMinimo = {
      nome: nomeCliente,
      tipo: tipoCli,
      situacao: 'A',
      contribuinte: 9, // 9 = Nao contribuinte
    };
    const contatoCompleto = {
      ...contatoMinimo,
      ...(cpfCli ? { numeroDocumento: cpfCli } : {}),
      ...(cliLocal?.email ? { email: cliLocal.email, emailNotaFiscal: cliLocal.email } : {}),
      ...(cliLocal?.telefone ? { telefone: cliLocal.telefone, celular: cliLocal.telefone } : {}),
      ...(isPJCli && dfCli.nomeFantasia ? { fantasia: dfCli.nomeFantasia } : {}),
      ...(isPJCli && dfCli.inscricaoEstadual ? { ie: dfCli.inscricaoEstadual } : {}),
      ...(endCli.endereco || endCli.cep ? { endereco: { geral: endCli, cobranca: endCli } } : {}),
    };

    let idContato = null;
    if (cpfCli) {
      for (const q of [`numeroDocumento=${cpfCli}`, `pesquisa=${cpfCli}`]) {
        const lista = await listarContatos(q);
        const match = lista.find((c: any) =>
          String(c.numeroDocumento || c.cpfCnpj || c.cpf || c.cnpj || '').replace(/\D/g, '') === cpfCli);
        if (match) { idContato = match.id; break; }
        await sleep(400);
      }
    }
    if (!idContato) {
      // Só aceita match exato de nome ou resultado único — pegar data[0] cegamente
      // pendurava a proposta no contato errado.
      const lista = await listarContatos(`pesquisa=${encodeURIComponent(nomeCliente)}`);
      const alvoNome = normalize(nomeCliente);
      const exato = lista.find((c: any) => normalize(c.nome || '') === alvoNome);
      const match = exato || (lista.length === 1 ? lista[0] : null);
      if (match) idContato = match.id;
    }

    await sleep(400);

    if (idContato) {
      // Contato JA existe: atualiza com os dados completos (CNPJ, endereco com
      // numero, fantasia, IE). Sem isso, um cliente ja cadastrado no Bling
      // continuava sem CNPJ e sem numero — os dados do cadastro nao chegavam.
      const upRes = await fetchWithBlingAuth(`https://api.bling.com.br/v3/contatos/${idContato}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contatoCompleto),
      }, supabaseClient);
      if (!upRes.ok) {
        const errText = await upRes.text();
        console.warn('[sync-bling-proposal] update do contato falhou:', errText.slice(0, 300));
      }
      await sleep(400);
    } else {
      // Criar Contato. O enriquecimento e best-effort: se o Bling recusar o
      // cadastro completo por validacao, cria o minimo e segue.
      const criarContato = async (corpo: any) => fetchWithBlingAuth('https://api.bling.com.br/v3/contatos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
      }, supabaseClient);

      let resContCria = await criarContato(contatoCompleto);
      if (!resContCria.ok) {
        const errText = await resContCria.text();
        console.warn('[sync-bling-proposal] contato completo recusado, tentando minimo:', errText.slice(0, 300));
        await sleep(400);
        resContCria = await criarContato(contatoMinimo);
      }

      if (resContCria.ok) {
        const newContData = await resContCria.json();
        if (newContData && newContData.data) {
          idContato = newContData.data.id;
        }
      } else {
        const errText = await resContCria.text();
        throw new Error(`Erro ao criar contato na Bling: ${errText}`);
      }
      await sleep(400);
    }

    if (!idContato) throw new Error('Falha ao criar contato.');

    const descAvista = payload.condicoes?.descontoAvista || 0;
    const descCartao = payload.condicoes?.descontoCartao || 0;

    // 3. Buscar bling_ids dos produtos locais
    const produtoIds = payload.itens.map((item: any) => item.id).filter(Boolean);
    const { data: localProducts } = await supabaseClient
      .from('produtos')
      .select('id, bling_id, codigo_sku')
      .in('id', produtoIds);

    // Map: local UUID → bling_id
    const blingIdMap = new Map<string, number>();
    if (localProducts) {
      for (const lp of localProducts) {
        if (lp.bling_id) blingIdMap.set(lp.id, lp.bling_id);
      }
    }

    // 4. Montar itens para a Proposta À VISTA
    const itensAvista = payload.itens.map((item: any) => {
      const precoTabela = Number(item.preco) || 0;
      const precoFinalAvista = item.preco_avista != null ? Number(item.preco_avista) : precoTabela * (1 - descAvista / 100);
      // Calcular o desconto percentual: quanto % o preço final é menor que o preço de tabela
      const descontoPercent = precoTabela > 0 ? Number((((precoTabela - precoFinalAvista) / precoTabela) * 100).toFixed(2)) : 0;
      const blingId = blingIdMap.get(item.id);
      return {
        codigo: item.codigo_sku || '',
        descricao: item.nome,
        unidade: 'UN',
        quantidade: item.quantidade,
        valor: Number(precoTabela.toFixed(2)),
        desconto: descontoPercent > 0 ? descontoPercent : 0,
        // Se temos o bling_id, vincula ao produto REAL. Senão, cai como texto livre (fallback).
        ...(blingId ? { produto: { id: blingId } } : { produto: { descricao: item.nome } })
      };
    });

    // 5. Montar itens para a Proposta A PRAZO
    const itensPrazo = payload.itens.map((item: any) => {
      const precoTabela = Number(item.preco) || 0;
      const precoFinalPrazo = item.preco_prazo != null ? Number(item.preco_prazo) : precoTabela * (1 - descCartao / 100);
      const descontoPercent = precoTabela > 0 ? Number((((precoTabela - precoFinalPrazo) / precoTabela) * 100).toFixed(2)) : 0;
      const blingId = blingIdMap.get(item.id);
      return {
        codigo: item.codigo_sku || '',
        descricao: item.nome,
        unidade: 'UN',
        quantidade: item.quantidade,
        valor: Number(precoTabela.toFixed(2)),
        desconto: descontoPercent > 0 ? descontoPercent : 0,
        ...(blingId ? { produto: { id: blingId } } : { produto: { descricao: item.nome } })
      };
    });

    const propostaBase: any = {
      contato: { id: idContato },
      transporte: {
        fretePorConta: 0,
        frete: Number(payload.frete) || 0
      }
    };
    if (idVendedor) {
      propostaBase.vendedor = { id: idVendedor };
    }

    /* O rotulo distingue as duas propostas do mesmo cliente na tela do Bling.
       Nada aqui pode sugerir criacao automatica: o campo acompanha o documento
       e o cliente nunca deve ler que a proposta dele saiu de um robo. */
    const propostaAvista = { ...propostaBase, itens: itensAvista, observacaoInterna: 'Valores À VISTA' };
    const propostaPrazo = { ...propostaBase, itens: itensPrazo, observacaoInterna: `Valores A PRAZO (${payload.condicoes?.parcelas || '12'}x)` };

    // Envia Proposta À Vista
    const blingResAvista = await fetchWithBlingAuth('https://api.bling.com.br/v3/propostas-comerciais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(propostaAvista)
    }, supabaseClient);

    if (!blingResAvista.ok) {
      const err = await blingResAvista.text();
      throw new Error(`Erro na Bling (Proposta À Vista): ${err}`);
    }
    const dataAvista = await blingResAvista.json();

    await sleep(400);

    // Envia Proposta A Prazo
    const blingResPrazo = await fetchWithBlingAuth('https://api.bling.com.br/v3/propostas-comerciais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(propostaPrazo)
    }, supabaseClient);

    if (!blingResPrazo.ok) {
      const err = await blingResPrazo.text();
      throw new Error(`Erro na Bling (Proposta A Prazo): ${err}`);
    }
    const dataPrazo = await blingResPrazo.json();

    // O POST devolve apenas o id — nunca o numero (ver BasePostResponse na doc).
    // Mas e o numero que aparece na tela de impressao do Bling, a unica chave
    // disponivel para casar o PDF capturado de volta com este orcamento. Por
    // isso buscamos logo apos criar; sem isso o vinculo nasce pela metade.
    const buscarNumero = async (id: any) => {
      if (!id) return null;
      try {
        await sleep(400);
        const r = await fetchWithBlingAuth(`https://api.bling.com.br/v3/propostas-comerciais/${id}`, { method: 'GET' }, supabaseClient);
        if (!r.ok) return null;
        return (await r.json())?.data?.numero ?? null;
      } catch (_) { return null; }
    };

    const numeroAvista = await buscarNumero(dataAvista?.data?.id);
    const numeroPrazo = await buscarNumero(dataPrazo?.data?.id);

    return new Response(JSON.stringify({
      success: true,
      vendedor: { id: idVendedor ?? null, nome: vendedorNome, solicitado: nomeConsultor },
      dataAvista: { ...dataAvista, data: { ...dataAvista?.data, numero: numeroAvista } },
      dataPrazo: { ...dataPrazo, data: { ...dataPrazo?.data, numero: numeroPrazo } },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  } catch (error: any) {
    console.error('Edge Function Error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
