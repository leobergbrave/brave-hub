-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração: Campos de entrega Bling
-- Vincula pedido Bling ao orçamento e registra entrega
-- ═══════════════════════════════════════════════

-- Campo para guardar o ID do pedido de venda no Bling
ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS bling_pedido_id bigint;

COMMENT ON COLUMN public.orcamentos_salvos.bling_pedido_id IS
  'ID do pedido de venda no Bling ERP (v3). Preenchido pelo sync-bling-proposal ao criar o pedido.';

-- Campo para guardar a data de entrega confirmada pelo Bling
ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS data_entrega timestamp with time zone;

COMMENT ON COLUMN public.orcamentos_salvos.data_entrega IS
  'Data em que o Bling confirmou a entrega do pedido (status "atendido"). Preenchido pelo sync-bling-status.';

-- Campo para guardar o status do pedido conforme retornado pelo Bling
ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS bling_status_pedido text;

COMMENT ON COLUMN public.orcamentos_salvos.bling_status_pedido IS
  'Último status do pedido consultado no Bling (ex: "em aberto", "atendido", "cancelado").';

-- Campo para guardar quando foi feita a última verificação no Bling
ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS bling_status_verificado_em timestamp with time zone;

COMMENT ON COLUMN public.orcamentos_salvos.bling_status_verificado_em IS
  'Timestamp da última vez que o status do pedido foi consultado na API do Bling.';

-- Política de UPDATE para a Edge Function poder atualizar status
CREATE POLICY IF NOT EXISTS "Edge functions podem atualizar orcamentos"
  ON public.orcamentos_salvos FOR UPDATE
  USING (true)
  WITH CHECK (true);
