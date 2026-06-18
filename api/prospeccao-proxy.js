import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // Buscar configurações com segurança no Supabase
    const { data: config, error: configError } = await supabase
      .from('prospeccao_config')
      .select('apify_token, gemini_key, prompt_personalizacao, automacao_ativa, automacao_nichos, automacao_nicho_atual_index, automacao_cidades, automacao_cidade_atual_index, automacao_limite, automacao_webhook_whatsapp, webhook_botconversa, mensagem_ativacao')
      .eq('id', 1)
      .single();

    if (configError || !config) {
      console.error('[Proxy] Config não encontrada:', configError);
      return res.status(400).json({ error: 'Configurações de prospecção não encontradas no banco de dados.' });
    }

    // Identificar serviço e ação — lê de query OU corpo da requisição
    const service = req.query?.service || req.body?.service;
    const action = req.query?.action || req.body?.action;

    console.log(`[Proxy] method=${req.method} service=${service} action=${action}`);

    // ─── PROXY: GEMINI ────────────────────────────────────────────────────────
    if (service === 'gemini') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Gemini Proxy requer método POST' });
      if (!config.gemini_key) return res.status(400).json({ error: 'Chave do Gemini não configurada.' });

      const { prompt } = req.body;
      if (!prompt) return res.status(400).json({ error: 'O parâmetro "prompt" é obrigatório.' });

      const key = config.gemini_key.trim();
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    // ─── PROXY: APIFY ─────────────────────────────────────────────────────────
    if (service === 'apify') {
      if (!config.apify_token) return res.status(400).json({ error: 'Token do Apify não configurado.' });
      const token = config.apify_token.trim();

      // ── AÇÃO: WEBHOOK (Callback do Apify após execução) ─────────────────────
      // O Apify faz um POST em ?service=apify&action=webhook com { eventData, resource }
      if (action === 'webhook') {
        console.log('[Webhook Apify] Recebendo callback do Apify...');
        console.log('[Webhook Apify] Body keys:', Object.keys(req.body || {}));

        // Parsear eventData e resource (podem vir como string ou objeto)
        let eventData = req.body?.eventData;
        let resource = req.body?.resource;

        if (typeof eventData === 'string') {
          try { eventData = JSON.parse(eventData); } catch (e) { /* já é string */ }
        }
        if (typeof resource === 'string') {
          try { resource = JSON.parse(resource); } catch (e) { /* já é string */ }
        }

        const runId = resource?.id;
        const datasetId = resource?.defaultDatasetId;
        const status = resource?.status;

        console.log(`[Webhook Apify] runId=${runId} status=${status} datasetId=${datasetId}`);

        // Responder imediatamente ao Apify para não timeout
        res.status(200).json({ message: 'Webhook recebido. Processando...' });

        // Processar em background (após resposta enviada)
        if (status !== 'SUCCEEDED' || !datasetId) {
          console.log('[Webhook Apify] Execução não bem-sucedida ou sem dataset. Registrando histórico de erro.');
          await supabase.from('prospeccao_historico').insert({
            nicho_buscado: 'Automático',
            cidade_buscada: 'Desconhecida',
            leads_encontrados: 0,
            leads_qualificados: 0,
            status: 'erro',
            detalhes: `Execução do Apify com status: ${status || 'desconhecido'}. runId: ${runId || 'N/A'}`
          });
          return;
        }

        // Processar leads em background
        processarLeadsApify({ supabase, token, datasetId, runId, config }).catch(err => {
          console.error('[Webhook Apify] Erro no processamento background:', err.message);
        });

        return;
      }

      // ── AÇÃO: CRON (Disparo diário / simulação) ──────────────────────────────
      if (action === 'cron' || (req.method === 'GET' && !action)) {
        const force = req.query.force === 'true';
        if (!config.automacao_ativa && !force) {
          return res.status(200).json({ status: 'inactive', message: 'Automação diária desativada.' });
        }

        const nichos = config.automacao_nichos || ['Box de CrossFit'];
        const cidades = config.automacao_cidades || [];
        const nichoIdx = config.automacao_nicho_atual_index || 0;
        const cidadeIdx = config.automacao_cidade_atual_index || 0;

        if (cidades.length === 0) {
          return res.status(400).json({ error: 'Nenhuma cidade configurada para a automação.' });
        }

        const nichoAtual = nichos[nichoIdx % nichos.length];
        const cidadeAtual = cidades[cidadeIdx % cidades.length];
        const termoDeBusca = `${nichoAtual} em ${cidadeAtual}`;

        // Webhook do Apify: URL sem parâmetros adicionais que possam ser corrompidos
        // Usamos apenas o endpoint base com service e action fixos
        const webhookCallbackUrl = 'https://brave-hub-two.vercel.app/api/prospeccao-proxy?service=apify&action=webhook';
        const webhooksPayload = [
          {
            eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
            requestUrl: webhookCallbackUrl,
            payloadTemplate: '{"eventData":{{eventData}},"resource":{{resource}}}'
          }
        ];
        const base64Webhooks = Buffer.from(JSON.stringify(webhooksPayload)).toString('base64')
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
        // Usar Base64URL (sem caracteres especiais) para evitar corrupção na URL

        console.log(`[Cron] Iniciando busca para: "${termoDeBusca}". Limite: ${config.automacao_limite}`);
        console.log(`[Cron] Webhook callback URL: ${webhookCallbackUrl}`);

        const apifyResponse = await fetch(
          `https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}&webhooks=${base64Webhooks}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              searchStringsArray: [termoDeBusca],
              maxCrawledPlacesPerSearch: parseInt(config.automacao_limite || 25),
              scrapeWebsite: false,
              scrapeReviews: false,
              scrapePeople: false,
              language: 'pt-BR'
            })
          }
        );

        if (!apifyResponse.ok) {
          const errText = await apifyResponse.text();
          console.error(`[Cron] Erro Apify: ${errText}`);
          throw new Error(`Falha ao iniciar Actor no Apify: ${errText}`);
        }

        const runData = await apifyResponse.json();
        const runId = runData.data?.id;
        console.log(`[Cron] Run iniciado com sucesso. Run ID: ${runId}`);

        // Verificar se webhook foi registrado
        const webhookInfo = runData.data?.buildId ? 'webhook registrado' : 'verificar manualmente';
        console.log(`[Cron] Detalhes run: ${JSON.stringify({ runId, webhookInfo, termoDeBusca })}`);

        // Rotação de nicho/cidade
        let proximoNichoIdx = nichoIdx + 1;
        let proximaCidadeIdx = cidadeIdx;
        if (proximoNichoIdx >= nichos.length) {
          proximoNichoIdx = 0;
          proximaCidadeIdx = (cidadeIdx + 1) % cidades.length;
        }

        await supabase
          .from('prospeccao_config')
          .update({
            automacao_nicho_atual_index: proximoNichoIdx,
            automacao_cidade_atual_index: proximaCidadeIdx
          })
          .eq('id', 1);

        return res.status(200).json({
          status: 'success',
          message: `Automação iniciada para "${termoDeBusca}".`,
          runId,
          webhookUrl: webhookCallbackUrl
        });
      }

      // ── AÇÃO: FILA (Disparo de mensagens pendentes) ──────────────────────────
      if (action === 'fila') {
        if (!config.automacao_webhook_whatsapp) {
          return res.status(200).json({ message: 'Webhook de WhatsApp da automação não configurado.' });
        }

        const webhookUrl = config.automacao_webhook_whatsapp.trim();

        const { data: pendentes, error: errFila } = await supabase
          .from('prospeccao_fila_envio')
          .select('*')
          .eq('status', 'pendente')
          .lte('agendado_para', new Date().toISOString());

        if (errFila) throw errFila;

        if (!pendentes || pendentes.length === 0) {
          return res.status(200).json({ message: 'Nenhuma mensagem pendente na fila para disparo.' });
        }

        console.log(`[Fila] ${pendentes.length} mensagens prontas para disparo.`);

        let enviados = 0;
        let falhas = 0;

        for (const lead of pendentes) {
          try {
            const response = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                nome_empresa: lead.nome_empresa,
                telefone: lead.telefone,
                mensagem: lead.mensagem,
                perfil_detectado: lead.perfil_detectado,
                cidade_origem: lead.cidade_origem,
                segmento_origem: lead.segmento_origem
              })
            });

            const novasTentativas = lead.tentativas + 1;
            if (response.ok) {
              enviados++;
              await supabase.from('prospeccao_fila_envio').update({
                status: 'enviado',
                enviado_em: new Date().toISOString(),
                tentativas: novasTentativas
              }).eq('id', lead.id);
            } else {
              falhas++;
              const errText = await response.text();
              await supabase.from('prospeccao_fila_envio').update({
                status: novasTentativas >= 3 ? 'falhou' : 'pendente',
                tentativas: novasTentativas,
                erro_mensagem: `HTTP ${response.status}: ${errText.substring(0, 200)}`
              }).eq('id', lead.id);
            }
          } catch (errDisparo) {
            falhas++;
            const novasTentativas = lead.tentativas + 1;
            await supabase.from('prospeccao_fila_envio').update({
              status: novasTentativas >= 3 ? 'falhou' : 'pendente',
              tentativas: novasTentativas,
              erro_mensagem: errDisparo.message
            }).eq('id', lead.id);
          }
        }

        return res.status(200).json({ message: 'Fila processada.', enviados, falhas });
      }

      // ── AÇÃO: DISPARO MANUAL (Nova Raspagem manual via formulário) ─────────────
      if (req.method === 'POST' && !action) {
        const { nicho, cidade, estado, limite } = req.body;
        const searchStringsArray = [`${nicho} em ${cidade} - ${estado}`];

        const response = await fetch(`https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchStringsArray,
            maxCrawledPlacesPerSearch: parseInt(limite || 10),
            scrapeWebsite: false,
            scrapeReviews: false,
            scrapePeople: false,
            language: 'pt-BR'
          })
        });

        const data = await response.json();
        return res.status(response.status).json(data);
      }

      // ── Ações legadas (status, dataset) ─────────────────────────────────────
      if (action === 'status' && req.query.runId) {
        const response = await fetch(`https://api.apify.com/v2/actor-runs/${req.query.runId}?token=${token}`);
        const data = await response.json();
        return res.status(response.status).json(data);
      }

      if (action === 'dataset' && req.query.datasetId) {
        const response = await fetch(`https://api.apify.com/v2/datasets/${req.query.datasetId}/items?token=${token}`);
        const data = await response.json();
        return res.status(response.status).json(data);
      }

      return res.status(400).json({ error: `Ação inválida: action="${action}" method="${req.method}"` });
    }

    return res.status(400).json({ error: `Serviço de proxy não especificado ou inválido: service="${service}"` });

  } catch (err) {
    console.error('[Proxy] Erro crítico:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
}

// ─── Função de Processamento de Leads (background, sem bloquear a resposta) ───
async function processarLeadsApify({ supabase, token, datasetId, runId, config }) {
  console.log(`[Background] Processando dataset ${datasetId} do run ${runId}...`);

  const resDataset = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}&limit=100`);
  if (!resDataset.ok) {
    const errText = await resDataset.text();
    throw new Error(`Falha ao baixar dataset do Apify: ${errText}`);
  }

  const rawItems = await resDataset.json();
  console.log(`[Background] Baixados ${rawItems.length} itens brutos do dataset.`);

  // Filtrar leads com telefone e que não existam ainda no banco
  const validItems = [];
  for (const item of rawItems) {
    const nomeEmpresa = item.title;
    if (!nomeEmpresa) continue;

    const telefoneBruto = item.phone || item.phoneUnformatted || '';
    const telefoneLimpo = telefoneBruto.replace(/\D/g, '');
    if (telefoneLimpo.length < 8) continue;

    const { data: existePC } = await supabase
      .from('potenciais_clientes')
      .select('id')
      .eq('nome_empresa', nomeEmpresa)
      .maybeSingle();

    const { data: existeCRM } = await supabase
      .from('leads')
      .select('id')
      .eq('nome', nomeEmpresa)
      .maybeSingle();

    if (existePC || existeCRM) {
      console.log(`[Background] Lead "${nomeEmpresa}" já existe. Pulando.`);
      continue;
    }

    item._telefoneLimpo = telefoneLimpo;
    validItems.push(item);
  }

  console.log(`[Background] ${validItems.length} leads válidos e inéditos encontrados.`);

  const totalEncontrados = rawItems.length;
  let qualificados = 0;
  let nichoBuscado = validItems[0]?.categoryName || 'Automático';
  let cidadeBuscada = validItems[0]?.city || 'Desconhecida';

  // Configurar janela de disparo (10h-19h Brasília = 13h-22h UTC)
  const hoje = new Date();
  const dataInicio10h = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 13, 0, 0));
  const totalMinutosJanela = 540;
  const totalLeads = validItems.length;

  for (let i = 0; i < totalLeads; i++) {
    const item = validItems[i];
    let gancho = '';
    let perfil = 'crossfit';
    let valido = true;

    // Classificar e gerar gancho personalizado com Gemini
    if (config.gemini_key) {
      try {
        // Prompt base: instrução do usuário (se preenchida) ou padrão
        const instrucaoGancho = config.prompt_personalizacao ||
`Crie uma mensagem curta de WhatsApp (2-4 linhas) em português que:
- Demonstre que pesquisamos e acessamos os dados e qualidades da empresa
- Mencione algo específico como a categoria, reputação, ou localização
- NÃO faça perguntas
- Seja natural e calorosa, como uma abordagem humana
- Comece com algo como "Vi que o..." ou "Acessei o perfil de..." ou "Notei que..."`.trim();

        const prompt = `Você é analista comercial da Brave Equipment (equipamentos fitness premium).

Analisando a empresa:
Nome: ${item.title}
Categoria: ${item.categoryName || 'academia'}
Descrição: ${item.subTitle || 'Não informada'}
Avaliacão: ${item.stars ? item.stars + ' estrelas' : 'sem dados'} (${item.reviewsCount || 0} avaliações)
Cidade: ${item.city || cidadeBuscada}, ${item.state || 'BR'}

Instrução:
${instrucaoGancho}

Retorne APENAS um JSON limpo (sem markdown):
{"valido":true,"nicho":"crossfit","oferece_hyrox":false,"gancho_whatsapp":"mensagem aqui"}`;

        const key = config.gemini_key.trim();
        const resGemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });

        if (resGemini.ok) {
          const geminiData = await resGemini.json();
          const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const jsonText = rawText.replace(/```json|```/gi, '').trim();
          const parsed = JSON.parse(jsonText);
          valido = parsed.valido !== false;
          perfil = parsed.oferece_hyrox ? 'hyrox' : (parsed.nicho || 'crossfit');
          gancho = parsed.gancho_whatsapp || '';
        }
      } catch (errGem) {
        console.warn(`[Background] Gemini falhou para "${item.title}": ${errGem.message}. Usando fallback.`);
      }
    }

    if (!valido) {
      console.log(`[Background] Lead "${item.title}" marcado como inválido pelo Gemini. Pulando.`);
      continue;
    }

    qualificados++;

    // Salvar em potenciais_clientes
    const { error: errPC } = await supabase.from('potenciais_clientes').insert({
      nome_empresa: item.title,
      segmento: item.categoryName || nichoBuscado,
      telefone: item._telefoneLimpo,
      email: item.email || null,
      site: item.website || null,
      cidade: item.city || cidadeBuscada,
      estado: item.state || 'BR',
      origem: 'raspagem',
      status: 'prospecto',
      dados_personalizados: {
        stars: item.stars,
        reviews: item.reviewsCount,
        maps_url: item.url,
        gancho_whatsapp: gancho
      }
    });

    if (errPC) {
      console.error(`[Background] Erro ao salvar potencial_cliente "${item.title}":`, errPC.message);
    }

    // Salvar também no CRM de Leads
    const { error: errLead } = await supabase.from('leads').insert({
      nome: item.title,
      telefone: item._telefoneLimpo,
      email: item.email || null,
      momento_compra: 'frio',
      observacoes: `Lead qualificado automaticamente via Prospecção Inteligente.\nNicho: ${perfil}\nGancho: ${gancho}`,
      status: 'novo',
      origem: 'prospeccao'
    });

    if (errLead) {
      console.warn(`[Background] Erro ao salvar lead CRM "${item.title}":`, errLead.message);
    }

    // Agendar na fila de envios com espaçamento linear + variação humana
    let minutosAdd = Math.floor(i * (totalMinutosJanela / Math.max(totalLeads, 1)));
    const variacao = Math.floor(Math.random() * 8);
    minutosAdd = Math.min(minutosAdd + variacao, totalMinutosJanela);

    const agendadoPara = new Date(dataInicio10h.getTime() + minutosAdd * 60 * 1000);

    const mensagemFinal = gancho || 'Olá! Conheça os equipamentos premium da Brave Equipment.';

    const { error: errFila } = await supabase.from('prospeccao_fila_envio').insert({
      nome_empresa: item.title,
      telefone: item._telefoneLimpo,
      mensagem: mensagemFinal,
      agendado_para: agendadoPara.toISOString(),
      status: 'pendente',
      tentativas: 0,
      perfil_detectado: perfil,
      cidade_origem: item.city || cidadeBuscada,
      segmento_origem: item.categoryName || nichoBuscado
    });

    if (errFila) {
      console.error(`[Background] Erro ao agendar na fila "${item.title}":`, errFila.message);
    } else {
      console.log(`[Background] Lead "${item.title}" agendado para ${agendadoPara.toISOString()}`);
    }

    // ── Disparar Fluxo BotConversa (webhook único com campo perfil_detectado) ───
    const webhookBotConversa = config.webhook_botconversa;

    if (webhookBotConversa) {
      try {
        const payloadBC = {
          telefone:          item._telefoneLimpo,
          nome_empresa:      item.title,
          mensagem_ativacao: config.mensagem_ativacao || 'Oi pessoal {{nome_empresa}}, tudo bem?',
          gancho_inicial:    mensagemFinal,
          perfil_detectado:  perfil,
          cidade_origem:     item.city || cidadeBuscada,
          segmento_origem:   item.categoryName || nichoBuscado
        };
        const reBC = await fetch(webhookBotConversa, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payloadBC)
        });
        console.log(`[BotConversa] Disparo para "${item.title}" (${perfil}): HTTP ${reBC.status}`);
      } catch (errBC) {
        console.warn(`[BotConversa] Falha ao disparar para "${item.title}":`, errBC.message);
      }
    } else {
      console.log(`[BotConversa] Webhook não configurado. Pulando.`);
    }
  }

  // Registrar histórico da execução
  await supabase.from('prospeccao_historico').insert({
    nicho_buscado: nichoBuscado,
    cidade_buscada: cidadeBuscada,
    leads_encontrados: totalEncontrados,
    leads_qualificados: qualificados,
    status: 'sucesso',
    detalhes: `Run ${runId}: ${totalEncontrados} encontrados → ${qualificados} qualificados e agendados na fila de envios.`
  });

  console.log(`[Background] Processamento concluído. ${qualificados}/${totalEncontrados} leads qualificados.`);
}
