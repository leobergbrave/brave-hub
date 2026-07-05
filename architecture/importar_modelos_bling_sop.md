# SOP — Importar Modelos de Orçamento do Bling

## Objetivo
Transformar as propostas comerciais já prontas no Bling em **modelos reutilizáveis**
(`orcamentos_modelo`) dentro do Brave Hub, e a partir de cada modelo gerar em 1 clique
o **link de orçamento** (`/orcamento/{slug}`) e a **proposta premium** (`/pp/{slug}`).

## Fluxo de dados (input → output)

### Bling: `GET /v3/propostas-comerciais`
- **Os filtros por número não funcionam** (`?numero=`, `?numeroProposta=`, `?pesquisa=` são ignorados).
  A lista volta em ordem **decrescente de `numero`**. Para achar um número específico é preciso
  **paginar** (`limite=100&pagina=N`) até encontrá-lo ou até `min(numero da página) < número procurado`.
- Detalhe: `GET /v3/propostas-comerciais/{id}` retorna `itens[]` com:
  `produto.id` (id Bling), `produto.descricao`, `codigo` (SKU), `quantidade`, `valor`, `desconto`.
  Também: `introducao` (texto de condições/venda), `total`, `transporte.frete`.
- **Item sem vínculo**: quando `produto.id === 0` e `codigo` vazio, é texto livre → vai para `itens_faltantes`.

### Mapeamento para o catálogo local (`produtos`)
1. `produto.id` (Bling) → `produtos.bling_id`
2. Fallback: `codigo` → `produtos.codigo_sku`
3. Sem match → registrado em `orcamentos_modelo.itens_faltantes` para o operador sincronizar.

### Preços
Sempre os **atuais do catálogo** (`produtos.preco`). O `preco_avista` do catálogo costuma ser nulo,
então o à vista é **derivado**: `preco * (1 - desconto_avista/100)` (padrão 15%, confirmado pela
introdução das propostas). Isso mantém o mesmo comportamento do montador de orçamento.

## API — `POST /api/bling` (função consolidada, `maxDuration: 60`)
Para respeitar o limite de **12 funções serverless do plano Hobby**, todas as operações
Bling ficam em `api/bling.js` (roteador por `?acao=`), delegando para helpers `_bling-*.js`
(que a Vercel não conta como função por causa do prefixo `_`).

| `?acao=` | Body | Efeito |
|---|---|---|
| `importar_modelos` | `{ numeros: [3747, ...] }` | Varre a lista, casa itens, faz **upsert** por `bling_proposta_id` em `orcamentos_modelo`. Idempotente. |
| `gerar_orcamento` | `{ modelo_id, nome, cep, telefone, desconto_avista, parcelas }` | Resolve itens no catálogo, calcula frete por CEP, cria `orcamentos_salvos` → retorna `/orcamento/{slug}`. |
| `gerar_proposta` | `{ modelo_id, nome, telefone, desconto_avista, validade_em }` | Monta `equipamentos[]` (quantidade embutida), cria `propostas_leads` → retorna `/pp/{slug}`. |
| `importar_bling` | `{ type, mode, ... }` | Importa produtos/clientes do Bling (helper `_bling-importar.js`). |
| `enviar_pedido` | `{ clienteId, orcamentoSlug }` | Cria proposta comercial no Bling (helper `_bling-pedido.js`). |
| `sincronizar_contato` | `{ clienteId }` | Cria/atualiza contato no Bling (helper `_bling-contato.js`). |

As páginas renderizadas no servidor também foram unificadas em `api/render.js` (`?tipo=share` → `/proposta/{slug}`, `?tipo=pp` → `/pp/{slug}`), preservando as URLs externas via rewrites no `vercel.json`.

Token do Bling: mesmo padrão self-healing de `enviar-bling-pedido.js` (`bling_config` + refresh em 401).

## Recuperação de falhas (self-annealing)
- Número inexistente → resultado marca `ok:false` com motivo; os demais seguem.
- Token expirado → refresh automático e persistência em `bling_config`.
- Item sem produto local → não quebra o modelo; entra em `itens_faltantes` e aparece com aviso na UI.
- Re-importar o mesmo número **atualiza** o modelo (não duplica), via índice único parcial em `bling_proposta_id`.

## Invariantes
- Migrations rodadas manualmente no Supabase (`20260705_orcamentos_modelo_bling.sql`, `20260705_propostas_leads.sql`).
- Um número de proposta = um modelo.
- `itens` do modelo sempre no formato compatível com o carregador existente: `[{produto_id, quantidade, ...}]`.

## Como testar
1. Rodar as duas migrations no Supabase.
2. Aba **Modelos** → importar o número **3747** → deve criar "BOX FULL BRAVE (#3747)", 40 itens, 0 faltantes.
3. No card, **Gerar link de orçamento** (nome + CEP) → abrir o link e conferir itens/frete.
4. **Gerar proposta premium** (nome) → abrir `/pp/{slug}` e conferir a página.
