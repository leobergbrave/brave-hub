-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração: Preços Fixos à Vista e a Prazo
-- Produtos podem ter preços tabelados por forma de pagamento
-- ═══════════════════════════════════════════════

-- 1. Novas colunas opcionais na tabela produtos
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS preco_avista NUMERIC;
ALTER TABLE public.produtos ADD COLUMN IF NOT EXISTS preco_prazo NUMERIC;

COMMENT ON COLUMN public.produtos.preco_avista IS 'Preço fixo à vista (PIX/Boleto). Se NULL, usa cálculo percentual sobre preco.';
COMMENT ON COLUMN public.produtos.preco_prazo IS 'Preço fixo a prazo (Cartão). Se NULL, usa cálculo percentual sobre preco.';
