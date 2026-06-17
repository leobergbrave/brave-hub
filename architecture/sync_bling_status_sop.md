# SOP: Sincronização de Status de Entrega do Bling v3

Este Procedimento Operacional Padrão (SOP) define a especificação técnica e as invariantes da automação responsável por sincronizar o status dos pedidos do Bling com o Supabase, ativando as ações do ciclo de Pós-Venda (Follow Up Clientes).

---

## 1. Objetivos
- Consultar o status de pedidos de vendas aprovados no Bling ERP.
- Atualizar a data de entrega do pedido no Supabase quando finalizado no ERP.
- Agendar automaticamente as datas das ações de **Avaliação Google** e **NPS** do pós-venda.

---

## 2. Fluxo de Execução (Lógica Passo a Passo)

1. **Autenticação no Supabase:**
   - O script conecta ao Supabase usando a chave `SUPABASE_SERVICE_ROLE_KEY` e a URL `VITE_SUPABASE_URL`.

2. **Obtenção do Token do Bling:**
   - O token de acesso do Bling e o refresh token são recuperados da tabela `bling_config` (onde `id = 1`).
   - O script testa o token em uma chamada leve da API do Bling. Se retornar HTTP 401, o script realiza o fluxo de *refresh* automático:
     - Envia o `refresh_token` para `https://www.bling.com.br/Api/v3/oauth/token`.
     - Atualiza o `access_token` e o `refresh_token` na tabela `bling_config` no Supabase com data de atualização.

3. **Busca de Orçamentos Pendentes de Entrega:**
   - Seleciona até 50 registros na tabela `orcamentos_salvos` que atendam aos seguintes critérios:
     - `payload->>'status' == 'Aprovado'`
     - `bling_pedido_id` não nulo
     - `data_entrega` nulo
     - `bling_status_pedido != 'cancelado'`

4. **Sincronização com o Bling (Iteração por Pedido):**
   - Para cada orçamento encontrado, o script realiza uma chamada GET para `https://api.bling.com.br/v3/pedidos/vendas/{bling_pedido_id}`.
   - Aplica um delay de 400ms após cada chamada para respeitar o limite de taxa do Bling (máximo de 3 requisições por segundo).

5. **Análise de Status:**
   - Se o status retornado for um dos seguintes: `atendido`, `entregue`, `concluido` ou `concluído`:
     - O pedido é considerado **entregue**.
     - Determina-se a data da entrega baseada no campo `dataEntrega` ou `dataSaida` da resposta do Bling (ou o timestamp atual caso indisponíveis).
     - Atualiza o orçamento no Supabase:
       - `bling_status_pedido` = status retornado do Bling
       - `bling_status_verificado_em` = data e hora atual
       - `data_entrega` = data de entrega identificada
     - **Agendamento do Pós-Venda:**
       - Atualiza a ação `avaliacao` na tabela `posv_acoes` para o mesmo orçamento com `prevista_em = data_entrega`.
       - Atualiza a ação `nps` na tabela `posv_acoes` para o mesmo orçamento com `prevista_em = data_entrega + 7 dias`.
   - Se o status não for entregue (ex: `em transporte`, `em preparação`):
     - Atualiza apenas `bling_status_pedido` e `bling_status_verificado_em` no Supabase.

---

## 3. Tratamento de Erros e Autocura (Self-Healing)
- **Token Expirado:** A renovação ocorre em tempo de execução sem interromper o fluxo de sincronização.
- **Falha em um Pedido:** Se um pedido falhar (por exemplo, ID inexistente ou erro 404 no Bling), o erro é registrado no console e o script continua para o próximo item, evitando travar a fila.
- **Transação no Supabase:** As consultas e atualizações ocorrem via chamadas REST na API do Supabase com headers de autenticação seguros.
