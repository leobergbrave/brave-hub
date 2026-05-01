-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração 003: Regras de Desconto v2
-- Modelo: Linha + Faixa de Valor + Cartão/PIX
-- ═══════════════════════════════════════════════

-- Remover tabelas antigas de desconto (se existirem)
DROP TABLE IF EXISTS descontos_linha;
DROP TABLE IF EXISTS descontos_volume;

-- Nova tabela unificada
CREATE TABLE IF NOT EXISTS regras_desconto (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  linha           TEXT NOT NULL,
  valor_min       NUMERIC NOT NULL DEFAULT 0,
  valor_max       NUMERIC,
  desconto_cartao NUMERIC NOT NULL DEFAULT 0,
  desconto_pix    NUMERIC NOT NULL DEFAULT 0
);

COMMENT ON TABLE regras_desconto IS 'Regras de desconto: Linha x Faixa de Valor x Forma de Pagamento';
COMMENT ON COLUMN regras_desconto.valor_max IS 'NULL = sem limite superior (acima de...)';

-- RLS
ALTER TABLE regras_desconto ENABLE ROW LEVEL SECURITY;
CREATE POLICY "regras_desconto select" ON regras_desconto FOR SELECT USING (true);
CREATE POLICY "regras_desconto insert" ON regras_desconto FOR INSERT WITH CHECK (true);
CREATE POLICY "regras_desconto update" ON regras_desconto FOR UPDATE USING (true);
CREATE POLICY "regras_desconto delete" ON regras_desconto FOR DELETE USING (true);

-- Seed com as regras do cliente
INSERT INTO regras_desconto (linha, valor_min, valor_max, desconto_cartao, desconto_pix) VALUES
  ('GYM',   0,     NULL,  15, 30),
  ('CROSS', 0,     20000, 0,  10),
  ('CROSS', 20000, 60000, 5,  12),
  ('CROSS', 60000, NULL,  10, 20);
