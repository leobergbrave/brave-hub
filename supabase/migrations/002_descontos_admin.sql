-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração 002: Descontos + Linhas
-- ═══════════════════════════════════════════════

-- 1. Adicionar coluna "linha" na tabela produtos
ALTER TABLE produtos ADD COLUMN IF NOT EXISTS linha TEXT DEFAULT 'Geral';

-- 2. Descontos por Linha de Produto
CREATE TABLE IF NOT EXISTS descontos_linha (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  linha         TEXT NOT NULL UNIQUE,
  percentual    NUMERIC NOT NULL DEFAULT 0
);

COMMENT ON TABLE descontos_linha IS 'Desconto automático por linha/categoria de produto. Ex: Cardio → 8%';

-- 3. Descontos por Faixa de Valor (Volume)
CREATE TABLE IF NOT EXISTS descontos_volume (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  valor_minimo  NUMERIC NOT NULL DEFAULT 0,
  percentual    NUMERIC NOT NULL DEFAULT 0
);

COMMENT ON TABLE descontos_volume IS 'Desconto escalonado por valor total do pedido. Ex: acima de R$30k → 3%';

-- 4. Configurações gerais
CREATE TABLE IF NOT EXISTS config (
  chave   TEXT PRIMARY KEY,
  valor   TEXT NOT NULL
);

INSERT INTO config (chave, valor) VALUES
  ('desconto_manual_max', '12')
ON CONFLICT (chave) DO NOTHING;

COMMENT ON TABLE config IS 'Configurações do sistema. Ex: limite máximo de desconto manual do consultor';

-- 5. Adicionar campos de desconto na tabela orcamentos
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS desconto_linha    NUMERIC DEFAULT 0;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS desconto_volume   NUMERIC DEFAULT 0;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS desconto_manual   NUMERIC DEFAULT 0;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS nome_cliente      TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS nome_consultor    TEXT;

-- 6. RLS
ALTER TABLE descontos_linha  ENABLE ROW LEVEL SECURITY;
ALTER TABLE descontos_volume ENABLE ROW LEVEL SECURITY;
ALTER TABLE config           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "descontos_linha select" ON descontos_linha FOR SELECT USING (true);
CREATE POLICY "descontos_linha insert" ON descontos_linha FOR INSERT WITH CHECK (true);
CREATE POLICY "descontos_linha update" ON descontos_linha FOR UPDATE USING (true);
CREATE POLICY "descontos_linha delete" ON descontos_linha FOR DELETE USING (true);

CREATE POLICY "descontos_volume select" ON descontos_volume FOR SELECT USING (true);
CREATE POLICY "descontos_volume insert" ON descontos_volume FOR INSERT WITH CHECK (true);
CREATE POLICY "descontos_volume update" ON descontos_volume FOR UPDATE USING (true);
CREATE POLICY "descontos_volume delete" ON descontos_volume FOR DELETE USING (true);

CREATE POLICY "config select" ON config FOR SELECT USING (true);
CREATE POLICY "config update" ON config FOR UPDATE USING (true);

-- 7. Permitir insert/update/delete de produtos (faltava na migração anterior)
CREATE POLICY "Produtos insert" ON produtos FOR INSERT WITH CHECK (true);
CREATE POLICY "Produtos update" ON produtos FOR UPDATE USING (true);
CREATE POLICY "Produtos delete" ON produtos FOR DELETE USING (true);

-- 8. Seed: Linhas de desconto exemplo
INSERT INTO descontos_linha (linha, percentual) VALUES
  ('Cardio', 8),
  ('Rigs', 5),
  ('Pisos', 5),
  ('Acessórios', 3),
  ('Geral', 0)
ON CONFLICT (linha) DO NOTHING;

-- 9. Seed: Faixas de volume exemplo
INSERT INTO descontos_volume (valor_minimo, percentual) VALUES
  (30000, 3),
  (80000, 5),
  (150000, 8)
ON CONFLICT DO NOTHING;
