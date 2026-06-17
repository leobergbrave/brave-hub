# Registro de Progresso (progress.md)

Este documento acompanha o progresso diário, testes realizados, erros encontrados e soluções aplicadas.

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


