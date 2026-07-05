-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração: Orçamentos Modelo × Bling
-- Estende orcamentos_modelo para importar propostas
-- comerciais do Bling como modelos prontos.
-- ═══════════════════════════════════════════════

ALTER TABLE public.orcamentos_modelo
  ADD COLUMN IF NOT EXISTS bling_proposta_id     BIGINT,
  ADD COLUMN IF NOT EXISTS bling_proposta_numero INTEGER,
  ADD COLUMN IF NOT EXISTS introducao            TEXT,
  ADD COLUMN IF NOT EXISTS total_bling           NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS itens_faltantes       JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS atualizado_em         TIMESTAMPTZ DEFAULT now();

COMMENT ON COLUMN public.orcamentos_modelo.bling_proposta_id     IS 'ID interno da proposta comercial no Bling (usado para importação idempotente).';
COMMENT ON COLUMN public.orcamentos_modelo.bling_proposta_numero IS 'Número visível da proposta comercial no Bling (o que o usuário informa).';
COMMENT ON COLUMN public.orcamentos_modelo.introducao            IS 'Texto de introdução/condições copiado da proposta do Bling.';
COMMENT ON COLUMN public.orcamentos_modelo.total_bling           IS 'Total da proposta como estava no Bling (referência).';
COMMENT ON COLUMN public.orcamentos_modelo.itens_faltantes       IS 'Itens da proposta sem vínculo no catálogo local [{descricao, codigo, bling_id, quantidade, valor}].';

-- Índice único parcial: uma proposta do Bling = um modelo (permite re-importar/atualizar).
CREATE UNIQUE INDEX IF NOT EXISTS orcamentos_modelo_bling_proposta_id_key
  ON public.orcamentos_modelo (bling_proposta_id)
  WHERE bling_proposta_id IS NOT NULL;
