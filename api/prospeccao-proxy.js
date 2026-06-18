import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar configurações de chaves com segurança no Supabase
    const { data: config, error: configError } = await supabase
      .from('prospeccao_config')
      .select('apify_token, gemini_key, automacao_ativa, automacao_nichos, automacao_nicho_atual_index, automacao_cidades, automacao_cidade_atual_index, automacao_limite, automacao_webhook_whatsapp')
      .eq('id', 1)
      .single();

    if (configError || !config) {
      return res.status(400).json({ error: 'Configurações de prospecção não encontradas no banco de dados.' });
    }

    // Identificar qual serviço de proxy está sendo solicitado
    const service = req.method === 'POST' ? req.body.service : req.query.service;

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
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      const data = await response.json();
      return res.status(response.status).json(data);
    }

    // ─── PROXY: APIFY ─────────────────────────────────────────────────────────
    if (service === 'apify') {
      if (!config.apify_token) return res.status(400).json({ error: 'Token do Apify não configurado.' });
      let token = config.apify_token.trim();

      // Receber webhook do Apify
      if (req.method === 'POST' && req.body.eventData && req.body.resource) {
        const { eventData, resource } = req.body;
        const runId = resource?.id;
        const datasetId = resource?.defaultDatasetId;

        console.log(`[Webhook Apify] Recebido callback para o Run ID: ${runId}. Status: ${resource?.status}`);

        if (resource?.status !== 'SUCCEEDED' || !datasetId) {
          await supabase.from('prospeccao_historico').insert({
            nicho_buscado: 'Automático',
            cidade_buscada: 'Desconhecida',
            leads_encontrados: 0,
            leads_qualificados: 0,
            status: 'erro',
            detalhes: `A execução do Apify falhou ou não gerou dataset. Status: ${resource?.status || 'N/A'}`
          });
          return res.status(200).json({ message: 'Webhook processado (falha registrada).' });
        }

        try {
          // Baixar o dataset
          const resDataset = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
          if (!resDataset.ok) throw new Error(`Falha ao baixar dataset do Apify: ${await resDataset.text()}`);
          
          const rawItems = await resDataset.json();
          console.log(`[Webhook Apify] Baixados ${rawItems.length} itens brutos.`);

          const validItems = [];
          for (const item of rawItems) {
            const nomeEmpresa = item.title;
            if (!nomeEmpresa) continue;

            const telefoneBruto = item.phone || item.phoneUnformatted || '';
            const telefoneLimpo = telefoneBruto.replace(/\D/g, '');
            if (telefoneLimpo.length < 8) continue;

            // Verificar se já existe no CRM ou potenciais_clientes
            const { data: existeCRM } = await supabase.from('leads').select('id').eq('nome', nomeEmpresa).maybeSingle();
            const { data: existePC } = await supabase.from('potenciais_clientes').select('id').eq('nome_empresa', nomeEmpresa).maybeSingle();

            if (existeCRM || existePC) continue;

            item.telefoneLimpo = telefoneLimpo;
            validItems.push(item);
          }

          console.log(`[Webhook Apify] Encontrados ${validItems.length} leads inéditos e válidos.`);

          let qualificados = 0;
          const totalEncontrados = rawItems.length;
          let nichoBuscado = 'N/A';
          let cidadeBuscada = 'N/A';

          if (validItems.length > 0) {
            cidadeBuscada = validItems[0].city || 'Região Sul/Sudeste';
            nichoBuscado = validItems[0].categoryName || 'Automático';

            // Configurar a janela útil de disparo (10h às 19h de Brasília = 13h às 22h UTC)
            const hoje = new Date();
            const dataInicio10h = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate(), 13, 0, 0));
            const totalMinutosJanela = 540;
            const totalLeads = validItems.length;

            for (let i = 0; i < totalLeads; i++) {
              const item = validItems[i];
              let perfil = 'crossfit';
              let gancho = '';
              let valido = true;

              if (config.gemini_key) {
                try {
                  const prompt = `
Você é o qualificador e redator comercial da Brave Equipment, fabricante premium de equipamentos de fitness.
Analise as informações do seguinte negócio raspado do Google Maps:
Nome: ${item.title}
Categoria: ${item.categoryName}
Site: ${item.website || 'Não disponível'}
Descrição: ${item.subTitle || ''}

Sua tarefa é retornar estritamente um JSON no seguinte formato (sem formatação markdown, apenas o json limpo):
{
  "valido": true,
  "nicho": "crossfit",
  "oferece_hyrox": false,
  "gancho_whatsapp": "Escreva uma mensagem de WhatsApp curta e impactante em português do Brasil com foco no nicho e diferencial da Brave. Se oferece_hyrox for true, a mensagem DEVE focar em equipamentos especializados para Hyrox (ergômetros, sleds/trenós, racks). Se for studio, focar em design premium personalizado."
}
`;
                  const key = config.gemini_key.trim();
                  const resGemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                  });

                  if (resGemini.ok) {
                    const geminiData = await resGemini.json();
                    const jsonText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text?.replace(/```json|```/g, '').trim();
                    const parsed = JSON.parse(jsonText);
                    valido = parsed.valido;
                    perfil = parsed.oferece_hyrox ? 'hyrox' : (parsed.nicho || 'crossfit');
                    gancho = parsed.gancho_whatsapp || '';
                  }
                } catch (errGem) {
                  console.error(`[Webhook Apify] Erro Gemini para "${item.title}":`, errGem);
                }
              }

              if (!valido) continue;
              qualificados++;

              // Salvar no banco
              await supabase.from('potenciais_clientes').insert({
                nome_empresa: item.title,
                segmento: item.categoryName || nichoBuscado,
                telefone: item.telefoneLimpo,
                email: item.email || null,
                site: item.website || null,
                cidade: item.city || cidadeBuscada,
                estado: item.state || 'BR',
                origem: 'raspagem',
                status: 'convertido',
                dados_personalizados: {
                  stars: item.stars,
                  reviews: item.reviewsCount,
                  maps_url: item.url,
                  gancho_whatsapp: gancho
                }
              });

              await supabase.from('leads').insert({
                nome: item.title,
                telefone: item.telefoneLimpo,
                email: item.email || null,
                momento_compra: 'frio',
                observacoes: `Lead qualificado automaticamente via Prospecção Inteligente.\nNicho detectado: ${perfil}\nGancho WhatsApp: ${gancho}`,
                status: 'novo',
                origem: 'prospeccao'
              });

              // Calcular agendamento linear com espaçamento humano (entre 10h e 19h)
              let minutosAdd = Math.floor(i * (totalMinutosJanela / totalLeads)) + Math.floor(Math.random() * 10 - 5);
              if (minutosAdd < 0) minutosAdd = 0;
              if (minutosAdd > totalMinutosJanela) minutosAdd = totalMinutosJanela;

              const agendadoPara = new Date(dataInicio10h.getTime() + minutosAdd * 60 * 1000);

              await supabase.from('prospeccao_fila_envio').insert({
                nome_empresa: item.title,
                telefone: item.telefoneLimpo,
                mensagem: gancho || 'Olá! Conheça os equipamentos premium da Brave Equipment.',
                agendado_para: agendadoPara.toISOString(),
                status: 'pendente',
                perfil_detectado: perfil,
                cidade_origem: item.city || cidadeBuscada,
                segmento_origem: item.categoryName || nichoBuscado
              });
            }
          }

          await supabase.from('prospeccao_historico').insert({
            nicho_buscado: nichoBuscado,
            cidade_buscada: cidadeBuscada,
            leads_encontrados: totalEncontrados,
            leads_qualificados: qualificados,
            status: 'sucesso',
            detalhes: `Automação diária concluída. ${qualificados} leads qualificados e agendados na fila de envios.`
          });

          return res.status(200).json({ status: 'success', qualificados });
        } catch (errWeb) {
          console.error('[Webhook Apify] Falha no processamento:', errWeb);
          return res.status(500).json({ error: errWeb.message });
        }
      }

      // Disparo manual (método POST)
      if (req.method === 'POST') {
        const { nicho, cidade, estado, limite } = req.body;
        const searchStringsArray = [`${nicho} em ${cidade} - ${estado}`];

        const response = await fetch(`https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            searchStringsArray,
            maxCrawledPlacesPerSearch: parseInt(limite || 10),
            scrapeWebsite: true,
            scrapeReviews: false,
            scrapePeople: false,
            language: 'pt-BR'
          })
        });

        const data = await response.json();
        return res.status(response.status).json(data);
      }

      // Ações GET (status, dataset, cron, fila)
      if (req.method === 'GET') {
        const { action, runId, datasetId } = req.query;

        // AÇÃO: CRON (Disparada diariamente)
        if (action === 'cron') {
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

          // Configurar o webhook do Apify codificado em Base64
          const webhookUrl = 'https://brave-hub-two.vercel.app/api/prospeccao-proxy?service=apify&action=webhook';
          const webhooksObj = [
            {
              eventTypes: ['ACTOR.RUN.SUCCEEDED', 'ACTOR.RUN.FAILED'],
              requestUrl: webhookUrl,
              payloadTemplate: '{\n  "eventData": {{eventData}},\n  "resource": {{resource}}\n}'
            }
          ];
          const base64Webhooks = Buffer.from(JSON.stringify(webhooksObj)).toString('base64');

          console.log(`[Automação] Disparando busca para: "${termoDeBusca}" no Apify...`);

          const response = await fetch(`https://api.apify.com/v2/acts/compass~crawler-google-places/runs?token=${token}&webhooks=${base64Webhooks}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              searchStringsArray: [termoDeBusca],
              maxCrawledPlacesPerSearch: parseInt(config.automacao_limite || 25),
              scrapeWebsite: true,
              scrapeReviews: false,
              scrapePeople: false,
              language: 'pt-BR'
            })
          });

          if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Falha ao iniciar Actor no Apify: ${errText}`);
          }

          const runData = await response.json();

          // Lógica de Rotação Combinada
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
            runId: runData.data?.id
          });
        }

        // AÇÃO: FILA (Disparada a cada 5 ou 10 minutos)
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

          console.log(`[Fila Disparos] Encontradas ${pendentes.length} mensagens prontas.`);

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

              if (response.ok) {
                enviados++;
                await supabase
                  .from('prospeccao_fila_envio')
                  .update({
                    status: 'enviado',
                    enviado_em: new Date().toISOString(),
                    tentativas: lead.tentativas + 1
                  })
                  .eq('id', lead.id);
              } else {
                falhas++;
                const errText = await response.text();
                const novasTentativas = lead.tentativas + 1;
                await supabase
                  .from('prospeccao_fila_envio')
                  .update({
                    status: novasTentativas >= 3 ? 'falhou' : 'pendente',
                    tentativas: novasTentativas,
                    erro_mensagem: `HTTP ${response.status}: ${errText}`
                  })
                  .eq('id', lead.id);
              }
            } catch (errDisparo) {
              falhas++;
              const novasTentativas = lead.tentativas + 1;
              await supabase
                .from('prospeccao_fila_envio')
                .update({
                  status: novasTentativas >= 3 ? 'falhou' : 'pendente',
                  tentativas: novasTentativas,
                  erro_mensagem: errDisparo.message
                })
                .eq('id', lead.id);
            }
          }

          return res.status(200).json({ message: 'Fila processada.', enviados, falhas });
        }

        // Ações legadas (status, dataset)
        if (action === 'status' && runId) {
          const response = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${token}`);
          const data = await response.json();
          return res.status(response.status).json(data);
        }

        if (action === 'dataset' && datasetId) {
          const response = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${token}`);
          const data = await response.json();
          return res.status(response.status).json(data);
        }

        return res.status(400).json({ error: 'Ação ou parâmetros inválidos no proxy do Apify.' });
      }
    }

    return res.status(400).json({ error: 'Serviço de proxy não especificado ou inválido.' });
  } catch (err) {
    console.error('Erro no proxy de prospecção:', err);
    return res.status(500).json({ error: err.message });
  }
}
