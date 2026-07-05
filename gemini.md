# Project Constitution: Brave Hub (B.L.A.S.T. Protocol)

Este documento atua como a constituição do projeto, contendo os schemas de dados, regras de comportamento e invariantes de arquitetura.

## Regras de Comportamento (Behavioral Rules)
1. **Idioma**: Sempre entregar as respostas em português do Brasil.
2. **Qualidade Visual**: Priorizar excelência visual (rich aesthetics), interfaces modernas, harmonia de cores, e micro-animações. Evitar designs simples ou básicos.
3. **Documentação de Telas**: Sempre ao gerar novas funcionalidades, inserir nas abas/telas um campo com os objetivos, instruções e informações sobre essa funcionalidade.
4. **Testes**: Sempre ao gerar novas funcionalidades, inserir formas de testá-las de maneira prática e fácil.
5. **Aprovações**:
   - Após aprovar uma nova alteração, não precisa realizar pedidos de autorização para acessar qualquer arquivo do sistema. Faça até finalizar a implementação.
   - Quando houver perguntas a serem respondidas para aprovação de uma nova funcionalidade, a aprovação só deve ocorrer após o usuário responder.
6. **Supabase & Banco de Dados**: Migrations SQL no Supabase devem ser enviadas para o usuário fazer manualmente.
7. **Publicação**: Sempre publicar uma alteração realizada e aprovada após a finalização.
8. **Invariantes do Protocolo B.L.A.S.T.**:
   - Toda automação deve ser determinística e autocicatrizante (self-healing).
   - O coding de ferramentas em `tools/` só começa quando o shape de dados do input/output estiver confirmado e documentado neste arquivo.

## Invariantes de Arquitetura (Architectural Invariants)
- **Camada 1 (SOPs)**: Arquivos `.md` em `architecture/` documentam o "como fazer" técnico.
- **Camada 2 (Navegação)**: O System Pilot toma decisões e coordena as ferramentas determinísticas.
- **Camada 3 (Tools)**: Scripts Python atômicos e testáveis em `tools/`. As chaves de API/Tokens vivem em `.env`.
- **Workbench Temporária**: `.tmp/` na raiz para arquivos e dados efêmeros.

## Schemas de Dados (JSON Data Schemas)

### 1. orcamentos_salvos.payload (JSONB)
```json
{
  "itens": [
    {
      "id": "uuid",
      "nome": "string",
      "preco": 0.0,
      "preco_avista": 0.0,
      "preco_prazo": 0.0,
      "peso_kg": 0.0,
      "url_imagem": "string",
      "codigo_sku": "string",
      "quantidade": 1,
      "descontoAvistaItem": 0.0,
      "descontoCartaoItem": 0.0
    }
  ],
  "estado": "string",
  "zona": "string",
  "telefoneCliente": "string",
  "condicoes": {
    "descontoAvista": 0.0,
    "descontoCartao": 0.0,
    "parcelas": 12
  },
  "frete": 0.0
}
```

### 2. clientes (Tabela Supabase)
- `id`: UUID (Chave Primária)
- `nome`: TEXT (Obrigatório)
- `telefone`: TEXT
- `email`: TEXT
- `tipo_pessoa`: TEXT (Default 'F')
- `cpf_cnpj`: TEXT
- `tipo_negocio`: TEXT
- `dados_fiscais`: JSONB (Dados adicionais como CEP, logradouro, IE, etc.)
- `origem`: TEXT (Default 'manual')
- `bling_contato_id`: BIGINT
- `status_ciclo`: TEXT (Default 'lead') - `lead` | `cliente_ativo` | `cliente_inativo`
- `criado_em`: TIMESTAMPTZ
- `atualizado_em`: TIMESTAMPTZ

### 3. posv_acoes (Tabela Supabase)
- `id`: UUID (Chave Primária)
- `orcamento_id`: TEXT (Obrigatório)
- `cliente_telefone`: TEXT
- `cliente_nome`: TEXT
- `estrategia_id`: TEXT (Obrigatório) - `montagem` | `avaliacao` | `nps` | `checkin30` | `checkin60` | `checkin90` | `promocao`
- `prevista_em`: TIMESTAMPTZ
- `executado_em`: TIMESTAMPTZ
- `canal`: TEXT
- `obs`: TEXT
- `criado_em`: TIMESTAMPTZ
- `atualizado_em`: TIMESTAMPTZ

### 4. potenciais_clientes (Tabela Supabase)
- `id`: UUID (Chave Primária)
- `nome_empresa`: TEXT (Obrigatório)
- `segmento`: TEXT
- `telefone`: TEXT
- `email`: TEXT
- `site`: TEXT
- `cidade`: TEXT
- `estado`: TEXT
- `origem`: TEXT (Default 'raspagem')
- `status`: TEXT (Default 'prospecto') - `prospecto` | `em_contato` | `convertido` | `descartado`
- `dados_personalizados`: JSONB (Dados gerados por IA, ex: gancho de mensagem, perfil de público, análise do site)
- `criado_em`: TIMESTAMPTZ
- `atualizado_em`: TIMESTAMPTZ

### 5. prospeccao_config (Tabela Supabase)
- `id`: SERIAL (Chave Primária)
- `apify_token`: TEXT
- `gemini_key`: TEXT
- `instantly_key`: TEXT
- `prompt_personalizacao`: TEXT
- `automacao_ativa`: BOOLEAN (Default false)
- `automacao_nichos`: JSONB
- `automacao_nicho_atual_index`: INT
- `automacao_cidades`: JSONB
- `automacao_cidade_atual_index`: INT
- `automacao_limite`: INT (Default 25)
- `automacao_webhook_whatsapp`: TEXT
- `updated_at`: TIMESTAMPTZ

### 6. prospeccao_fila_envio (Tabela Supabase)
- `id`: UUID (Chave Primária)
- `criado_em`: TIMESTAMPTZ
- `nome_empresa`: TEXT
- `telefone`: TEXT
- `mensagem`: TEXT
- `agendado_para`: TIMESTAMPTZ
- `status`: TEXT (Default 'pendente') - `pendente` | `enviado` | `falhou`
- `tentativas`: INT
- `erro_mensagem`: TEXT
- `enviado_em`: TIMESTAMPTZ
- `perfil_detectado`: TEXT
- `cidade_origem`: TEXT
- `segmento_origem`: TEXT

### 7. prospeccao_historico (Tabela Supabase)
- `id`: UUID (Chave Primária)
- `criado_em`: TIMESTAMPTZ
- `nicho_buscado`: TEXT
- `cidade_buscada`: TEXT
- `leads_encontrados`: INT
- `leads_qualificados`: INT
- `status`: TEXT (Default 'sucesso') - `sucesso` | `erro`
- `detalhes`: TEXT

---

### 8. orcamentos_modelo (Tabela Supabase) — estendida para Bling
- `id`: UUID (Chave Primária)
- `nome`: TEXT · `descricao`: TEXT · `consultor`: TEXT · `ativo`: BOOLEAN
- `itens`: JSONB — `[{produto_id, quantidade, codigo, nome, preco, peso_kg, url_imagem, bling_id}]`
- `bling_proposta_id`: BIGINT (único parcial) — id interno da proposta comercial no Bling
- `bling_proposta_numero`: INT — número visível no Bling (o que o usuário informa)
- `introducao`: TEXT — texto de condições/venda copiado da proposta
- `total_bling`: NUMERIC — total de referência da proposta
- `itens_faltantes`: JSONB — itens sem vínculo no catálogo `[{descricao, codigo, bling_id, quantidade, valor}]`
- `criado_em` / `atualizado_em`: TIMESTAMPTZ

### 9. propostas_leads (Tabela Supabase) — proposta premium `/pp/{slug}`
- `id`: UUID · `slug`: TEXT (único) · `lead_nome`: TEXT · `telefone_lead`: TEXT
- `objetivo`: TEXT · `mensagem_personalizada`: TEXT · `validade_em`: DATE · `vendedor_telefone`: TEXT
- `equipamentos`: JSONB — `[{nome, descricao, specs[], imagem_url, preco, preco_avista, parcelas, preco_parcela, destaque}]`
- `status`: TEXT (`enviada` | `aberta`) · `aberturas`: INT · `primeira_abertura_em` / `ultima_abertura_em`: TIMESTAMPTZ
- `modelo_id`: UUID (→ orcamentos_modelo) · `criado_em`: TIMESTAMPTZ

## Maintenance Log (Registro de Manutenção)
- **2026-06-17**: Inicialização e estruturação do protocolo B.L.A.S.T. e da arquitetura de 3 camadas A.N.T. Adicionada a documentação das tabelas e payloads reais do Brave Hub.
- **2026-06-17**: Adicionados os schemas de dados para a nova funcionalidade de Potenciais Clientes (`potenciais_clientes` e `prospeccao_config`).
- **2026-06-17**: Correção do bug de prospecção com a consolidação das APIs serverless para respeitar o limite Hobby de 12 funções da Vercel (deletados importadores individuais e lead-respondeu) e mapeamento do alias do domínio `brave-hub-two.vercel.app`.
- **2026-06-17**: Resolução do bug de prospecção ("Actor with this name was not found") com a migração para o novo ator `compass~crawler-google-places`, renomeação da propriedade de busca para `searchStringsArray` e ajuste do idioma para `pt-BR`.
- **2026-07-05**: **Consolidação de funções serverless (limite Hobby = 12)**. Unificadas 4 APIs Bling em `api/bling.js` (`?acao=importar_bling|enviar_pedido|sincronizar_contato|importar_modelos|gerar_orcamento|gerar_proposta`) e os 2 renderizadores HTML em `api/render.js` (`?tipo=share|pp`), delegando para helpers `_bling-*.js`/`_render-*.js` (não contados como função). Callers do frontend (ClientesTab, ProdutosTab, ModelosTab) e rewrites do `vercel.json` atualizados. Resultado: **11 funções** (era 15). URLs externas (`/proposta/`, `/pp/`) preservadas.
- **2026-07-05**: Módulo **Modelos de Orçamento (Bling)**. Nova aba `src/admin/ModelosTab.jsx` + API consolidada `api/modelos.js` (`?acao=importar|gerar_orcamento|gerar_proposta`, `maxDuration:60`). Importa propostas comerciais do Bling por número (paginação — os filtros por número do Bling não funcionam), casa itens por `bling_id`/`codigo_sku`, salva como modelo idempotente. Gera link de orçamento (`/orcamento/{slug}`) e proposta premium (`/pp/{slug}`). Criada a tabela `propostas_leads` que faltava no banco (o renderizador `proposta-lead.js` já existia). Migrations: `20260705_orcamentos_modelo_bling.sql`, `20260705_propostas_leads.sql`. Validado contra a proposta 3747 (BOX FULL BRAVE, 40/40 itens vinculados). SOP: `architecture/importar_modelos_bling_sop.md`.
- **2026-06-18**: Implementação da automação diária de prospecção às 06h com agendamento inteligente de envios em fila (delays de 1 a 15 min), qualificação via Gemini com detecção de Hyrox e painel de controle e logs unificados na aba Potenciais Clientes. Ajustado o cron para limites Hobby da Vercel (cron da fila movido para disparo via cron-job.org).


