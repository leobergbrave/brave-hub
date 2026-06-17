# SOP: Prospecção de Potenciais Clientes com Google Maps Scraper e Gemini

Este Procedimento Operacional Padrão (SOP) descreve o funcionamento técnico do script de automação de prospecção fria B2B (`tools/prospectar_leads.py`).

---

## 1. Visão Geral
A automação busca de forma proativa estabelecimentos comerciais (como academias e boxes de crossfit) com base nos critérios geográficos e de nicho informados pelo usuário, enriquecendo os registros com pitchings de abordagem criados dinamicamente pela IA **Gemini 3.5 Flash** (modelo de baixo custo e alta velocidade de resposta).

---

## 2. Lógica Passo a Passo

### A. Coleta de Dados Brutos (Apify)
1. O script consome as credenciais e parâmetros salvos em `prospeccao_config` e na chamada de terminal.
2. Faz uma chamada HTTP POST para a API do Apify para iniciar o actor `apify/google-maps-scraper`.
3. O payload enviado para o Apify segue a estrutura:
   ```json
   {
     "searchStrings": ["{nicho} em {cidade} - {estado}"],
     "maxCrawledPlacesPerSearch": {limite},
     "scrapeWebsite": true,
     "language": "pt",
     "exportPlaceUrls": false
   }
   ```
4. O script realiza um loop de checagem (polling) a cada 10 segundos até que a execução no Apify seja finalizada.
5. Baixa o dataset final contendo nome, telefone, site, endereço e avaliação do local.

### B. Enriquecimento de Contatos e Redes
- Para cada local retornado:
  - Tenta identificar o e-mail no payload retornado (Apify tenta extrair do site).
  - Tenta identificar redes sociais (Instagram, Facebook) e telefone limpo.

### C. Personalização de Abordagem Comercial (Gemini 3.5 Flash)
- Se a empresa tiver site ou descrição institucional:
  - Envia para a API do Gemini os dados textuais da empresa junto com o `prompt_personalizacao` salvo no banco.
  - A API chamada é a do Gemini (usando o modelo `gemini-3.5-flash` na rota `/v1beta/models/gemini-3.5-flash:generateContent`).
  - O Gemini gera um "gancho de WhatsApp" de até 3 frases focado no nicho e pontos fortes observados no lead.

### D. Persistência de Dados (Supabase)
- Insere o lead na tabela `potenciais_clientes`:
  - `nome_empresa` = Nome retornado
  - `segmento` = Categoria do Maps
  - `telefone` = Telefone limpo formatado
  - `email` = E-mail extraído (priorizado no banco)
  - `site` = URL do site
  - `cidade` = Cidade informada
  - `estado` = Estado informado
  - `dados_personalizados` = `{ "gancho_whatsapp": "...", "rating": 4.5, "avaliacoes": 120 }`
  - Evita duplicidade fazendo busca pelo nome do local e cidade antes da inserção.

---

## 3. Tratamento de Erros e Edge Cases
- **Limite de Créditos no Apify:** Se a API Key do Apify estiver sem fundos, o script gera logs detalhados e sugere o fallback de busca de dados locais.
- **Falha na Chamada do Gemini:** Caso a API do Gemini falhe (HTTP 429 ou 500), o script salva o lead com o gancho comercial em branco, permitindo que o usuário tente enriquecer o lead posteriormente pela interface do frontend.
