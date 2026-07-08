# Registro de Progresso (progress.md)

Este documento acompanha o progresso diário, testes realizados, erros encontrados e soluções aplicadas.

## [2026-07-08] LP CrossFit configurável no admin + cache OG (WhatsApp)

### O que foi feito:
- **Item 1 (prévias das outras LPs no WhatsApp):** produção estava correta (todas as 4 og:image retornam 200/PNG e o casco certo). O problema era **cache do WhatsApp** — `/lp/ergometros` e `/lp/box-hibrido` foram coladas antes do deploy da prévia. Solução p/ o usuário: Facebook Sharing Debugger → Scrape Again (ou sufixo `?v=2` no link). Sem mudança de código.
- **Item 2 (LP CrossFit totalmente configurável):**
  - Config extraída para `src/data/lpCrossfitConfig.js` no **modelo plano** (`produtos[]` com campo `categoria` + `preco_avista_txt`/`preco_prazo_txt`/`preco_nota`), importada pela página e pelo seeder.
  - `LpCrossfit.jsx` refatorada: agrupa produtos por `categoria` (ordem/estilo em `config.categorias`), esconde rascunho sem nome, preço por texto **ou** numérico.
  - `LandingPagesTab.jsx`: formulário de produto ganhou campo **Categoria** (com datalist) e bloco **Preço em texto** (à vista/parcelado/nota) — opcionais, ignorados pelas outras LPs.
  - Registro **`crossfit-box`** criado em `landing_pages_config` via `tools/seed-crossfit-lp.mjs` (RLS permite insert com anon key, HTTP 201). Agora a LP aparece na lista do admin e é editável (Geral/Hero/Produtos/Avançado).

## [2026-07-08] Nova Landing Page — Box de CrossFit

### O que foi feito:
- **Pedido:** nova LP focada em box de CrossFit, baseada no catálogo Brave 2026 (PDF de 59 páginas). Decisões do usuário: formato **catálogo completo por categoria, sem Ergômetros** (já tem LP própria) e **com preços**.
- **Página `src/pages/LpCrossfit.jsx`** (rota `/lp/crossfit`): hero + 4 pilares (fundição própria, linha completa, projetos sob medida, padrão competição) + 6 categorias com produtos e preços extraídos do catálogo: **Barras Olímpicas** (EvoBlack/EvoChrome), **Anilhas** (Bumper Black/Collor, Competition, Hi-Temp, Fracionadas), **Fundições** (Kettlebell/Dumbbell Iron e Evo), **Racks & Rigs** (Squat Stand, Wall/Elite Racks, Rigs sob consulta), **Organizadores** (estantes, expositores, suportes) e **Acessórios** (caixa de salto, argolas, med balls, piso, sled, jerk blocks, GHD, bags, cordas). Bloco de condições (pagamento 10x/à vista, entrega própria, consultoria) + CTA WhatsApp. Padrão dark+neon.
- **Config flexível:** `DEFAULT_CONFIG.categorias[]` com preços como strings ("A partir de R$ 999", "R$ 14 / kg", "Valores sob consulta"). Carrega override do Supabase se existir `landing_pages_config` id `crossfit-box` (editável pelo JSON avançado do admin). WhatsApp default do catálogo: (14) 98145-1119.
- **Prévia (Open Graph):** card `public/og/crossfit.png` gerado; casco `dist/lp/crossfit/index.html`; rota no `vercel.json`; miniatura na aba Landing Pages.
- **Validação:** `npm run build` OK; casco e og:image conferidos; ícones lucide validados. Requer deploy.

## [2026-07-08] Produtos das LPs: cadastro livre + rascunho oculto

### O que foi feito:
- **Pedido:** poder inserir mais produtos na LP Hyrox cadastrando cada um manualmente, com campos livres, sem que um cadastro vazio apareça na página.
- **LP esconde produto vazio:** `LpHyrox.jsx` e `LpErgometros.jsx` agora filtram produtos sem `nome` (`filter(p => (p?.nome||'').trim())`) — dá pra adicionar quantos quiser; só aparecem quando preenchidos.
- **Admin (`LandingPagesTab.jsx`):** botão **Adicionar Produto** agora cria o slot **em branco** (antes vinha "Novo Produto") e já **abre** para edição. Cabeçalho do card mostra selo âmbar **"Rascunho · oculto na página"** quando sem nome. Aviso no topo da seção Produtos explicando a regra.
- **Fonte da verdade:** a LP Hyrox lê produtos do Supabase (`landing_pages_config` / `hyrox-oficial`, 6 produtos hoje) — o cadastro é feito pela aba Landing Pages e salvo no banco.
- **Validação:** `npm run build` OK. Requer deploy para valer em produção.

## [2026-07-08] Prévia de Link (Open Graph) das Landing Pages

### O que foi feito:
- **Problema:** ao colar links das LPs (`/lp/ergometros`, `/lp/box-hibrido`, `/lp/hyrox`) no WhatsApp, aparecia só o logo pequeno — o robô do WhatsApp/Instagram/Telegram **não roda JavaScript**, então lê apenas as tags genéricas do `index.html` do SPA.
- **Cards premium (1200×630):** `tools/gen-og-cards.mjs` gera os PNGs com **satori** (texto→vetor, nítido) + **sharp** (SVG→PNG), 100% na identidade (dark `#050507` + neon `#39ff14` + logo + selo + gatilho de preço). Saída commitada em `public/og/` (não depende do build da Vercel nem de créditos de IA). Fontes Inter em `tools/fonts/`. 4 cards: ergometros, box-hibrido, hyrox e `brave` (genérico p/ raiz).
- **Entrega sem custo de função:** `tools/gen-lp-shells.mjs` roda no **postbuild** (`npm run build`) e cria `dist/lp/<slug>/index.html` — "casco" com as tags Open Graph próprias (og:image/title/description/twitter) + o mesmo bundle React (página segue funcionando p/ humanos). **Zero funções serverless** (continua 11/12 na Hobby).
- **Roteamento:** `vercel.json` mapeia `/lp/{slug}` → casco estático antes do fallback do SPA. `index.html` ganhou og:image padrão (`/og/brave.png`) + twitter card.
- **UI:** bloco informativo (objetivo/como funciona/como testar) + miniaturas das 3 prévias com copiar-link na aba **Landing Pages** (`src/admin/LandingPagesTab.jsx`).
- **Validação:** `npm run build` OK; cascos inspecionados (tags corretas, sem duplicatas, bundle referenciado).
- **Como testar:** colar o link no WhatsApp; se cachear a prévia antiga, forçar em developers.facebook.com/tools/debug (Scrape Again).

## [2026-07-05] Modelos de Orçamento a partir do Bling

### O que foi feito:
- **Validação com dados reais (Fase Link):** sonda contra a API do Bling confirmou que `GET /v3/propostas-comerciais` **ignora filtros por número** (necessário paginar, ordem decrescente), e que o detalhe traz `itens[]` com `produto.id`+`codigo`+`quantidade`+`valor`. A proposta **3747 (BOX FULL BRAVE)** mapeou **40/40 itens** no catálogo local por `bling_id`.
- **Migrations (rodar manual no Supabase):**
  - `20260705_orcamentos_modelo_bling.sql` — estende `orcamentos_modelo` (rastreio Bling + `itens_faltantes`, índice único parcial por `bling_proposta_id`).
  - `20260705_propostas_leads.sql` — **cria** a tabela `propostas_leads`, que o renderizador `api/proposta-lead.js` já esperava mas nunca havia sido criada.
- **API `api/modelos.js`** (consolidada p/ respeitar limite de funções): `?acao=importar` (número→modelo, idempotente), `?acao=gerar_orcamento` (→ `/orcamento/{slug}` com frete por CEP), `?acao=gerar_proposta` (→ `/pp/{slug}`). Token Bling self-healing.
- **UI `src/admin/ModelosTab.jsx`** + registro no menu (Comercial → Modelos): importar por número com resultado ao vivo (incl. itens faltantes), lista de modelos e modal de geração dos dois tipos de link com copiar/abrir. Inclui bloco de objetivos/instruções/teste.
- **Preços:** sempre os atuais do catálogo; à vista derivado (15% padrão).
- **Validação:** `npm run build` OK; dry-run da importação da 3747 confirmou nome, 40 itens, 0 faltantes, total 44.620,40.
- **Pendente do usuário:** rodar as 2 migrations e fazer deploy.

## [2026-06-17] Inicialização da Memória do Projeto

### O que foi feito:
- Inicializada a memória do projeto através do protocolo B.L.A.S.T.:
  - Criado `gemini.md` (Constituição do Projeto)
  - Criado `task_plan.md` (Plano de Tarefas e Checklist)
  - Criado `findings.md` (Pesquisa e Restrições)
  - Criado `progress.md` (Registro de Progresso)

### Desenvolvimento e Execução (B.L.A.S.T.)
- **Estruturação de Pastas:** Criadas as pastas `architecture/` (SOPs), `tools/` (Python scripts) e `.tmp/` na raiz do projeto.
- **SOP Técnico:** Criado o documento `architecture/sync_bling_status_sop.md` com a especificação e fluxos de erro.
- **Automação Python:** Desenvolvido o script `tools/sync_bling_status.py` com refresh token de autocura, mapeamento dinâmico de IDs de situação do Bling v3 e atualizações de agenda de pós-venda no Supabase.
- **Refinamento de UI:** Atualizado o arquivo `src/admin/PosVendaTab.jsx` para exibir o painel do B.L.A.S.T., contendo objetivos, instruções de uso e instruções de teste do script local.
- **Validação:** Script rodado com sucesso localmente, atualizando 13 pedidos entregues no Supabase e gerando as datas das ações de pós-venda. Projeto React compilado (`npm run build`) sem erros.

## [2026-06-17] Módulo de Prospecção & Potenciais Clientes (Leads Frios)

### O que foi feito:
- **Banco de Dados:** Criado o arquivo de migração SQL `supabase/migrations/20260617_prospeccao.sql` contendo os schemas de `potenciais_clientes` e `prospeccao_config` com segurança RLS ativa.
- **SOP Técnico:** Criado o documento `architecture/prospeccao_sop.md` detalhando o fluxo de integração do Apify e do Gemini 3.5 Flash.
- **Automação Python:** Desenvolvido o script local `tools/prospectar_leads.py` que executa a raspagem com Apify, realiza enriquecimento com a API do Gemini 3.5 Flash (`gemini-3.5-flash`) e registra os leads no Supabase.
- **Interface React:**
  - Registrado o menu e a aba em `src/pages/AdminPage.jsx`.
  - Criado o painel `src/admin/ProspeccaoTab.jsx` com suporte a listagem, filtros, modal de visualização de ganchos de IA, formulário de disparo com logs em tempo real e aba de chaves de API.
- **Compilação e Deploy:** O projeto foi buildado localmente (`npm run build`) com sucesso e publicado em produção no Vercel.
- **Resolução do Limite Vercel Hobby (12 funções):**
  - Unificadas as APIs de importação (`importar-clientes-bling` e `importar-produtos-bling` foram apagados e a lógica mesclada em `importar-bling.js`).
  - Unificada a API de resposta de lead (`lead-respondeu.js` mesclada em `disparo-resposta.js`).
  - Configurado rewrite no `vercel.json` para manter compatibilidade com webhooks externos.
  - Atualizado o alias de produção `brave-hub-two.vercel.app` para apontar para o novo deploy, corrigindo o bug do botão de Prospecção (que dava 404/redirecionava).


