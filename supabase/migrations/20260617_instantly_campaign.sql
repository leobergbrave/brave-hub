-- ═══════════════════════════════════════════════════════
-- BRAVE HUB — Adicionar Integração de Campanha do Instantly
-- Executar no SQL Editor do Supabase manualmente
-- ═══════════════════════════════════════════════════════

ALTER TABLE public.prospeccao_config 
ADD COLUMN IF NOT EXISTS instantly_campaign_id TEXT;

COMMENT ON COLUMN public.prospeccao_config.instantly_campaign_id IS 'ID UUID da campanha de cold mail ativa no Instantly';
