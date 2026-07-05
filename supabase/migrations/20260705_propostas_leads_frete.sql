-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração: Frete na proposta premium
-- Guarda o frete calculado por CEP na geração da
-- proposta premium (/pp), para exibir e somar no total.
-- ═══════════════════════════════════════════════

ALTER TABLE public.propostas_leads
  ADD COLUMN IF NOT EXISTS frete  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estado TEXT;

COMMENT ON COLUMN public.propostas_leads.frete  IS 'Frete calculado por CEP na geração da proposta (0 quando sem CEP).';
COMMENT ON COLUMN public.propostas_leads.estado IS 'UF resolvida do CEP informado (para exibir junto ao frete).';
