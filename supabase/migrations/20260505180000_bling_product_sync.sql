-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração: Coluna bling_id nos produtos
-- Vincula cada produto local ao ID real no Bling ERP
-- ═══════════════════════════════════════════════

ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS bling_id bigint UNIQUE;

COMMENT ON COLUMN public.produtos.bling_id IS 'ID do produto no Bling ERP (v3). Preenchido automaticamente pela sincronização.';

-- Política de UPDATE público (necessária para a Edge Function de sync)
CREATE POLICY "Permitir update de produtos"
ON public.produtos FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Permitir insert de produtos"
ON public.produtos FOR INSERT WITH CHECK (true);
