-- ═══════════════════════════════════════════════════════
-- BRAVE HUB — Migração Inicial: Tabelas Essenciais
-- Executar no SQL Editor do Supabase
-- ═══════════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- 1. PRODUTOS (importação do Bling)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS produtos (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_sku  TEXT,
  nome        TEXT NOT NULL,
  preco       NUMERIC NOT NULL DEFAULT 0,
  peso_kg     NUMERIC,
  url_imagem  TEXT
);

COMMENT ON TABLE  produtos IS 'Catálogo de equipamentos - importável do Bling';
COMMENT ON COLUMN produtos.codigo_sku IS 'SKU do produto no Bling. Ex: TURFLANES';
COMMENT ON COLUMN produtos.peso_kg IS 'Peso em KG para cálculo de frete - preencher manualmente';
COMMENT ON COLUMN produtos.url_imagem IS 'URL da foto do produto para a Vitrine do Cliente';

-- ────────────────────────────────────────────
-- 2. REGRAS DE FRETE (tabela logística)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS regras_frete (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  estado        TEXT NOT NULL,
  zona          TEXT NOT NULL,
  multiplicador NUMERIC NOT NULL DEFAULT 1.0,
  valor_minimo  NUMERIC NOT NULL DEFAULT 0
);

COMMENT ON TABLE  regras_frete IS 'Tabela de frete por estado/zona - digitalização do PDF logístico';
COMMENT ON COLUMN regras_frete.multiplicador IS 'Fator multiplicador do peso. Ex: 1.4 para MG Capital';
COMMENT ON COLUMN regras_frete.valor_minimo IS 'Valor mínimo de frete para o estado. Ex: 150.00';

-- Constraint única para evitar duplicatas de estado+zona
ALTER TABLE regras_frete ADD CONSTRAINT uq_estado_zona UNIQUE (estado, zona);

-- ────────────────────────────────────────────
-- 3. ORÇAMENTOS (projetos gerados)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orcamentos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  criado_em         TIMESTAMPTZ DEFAULT now(),
  status            TEXT NOT NULL DEFAULT 'Pendente',
  valor_total       NUMERIC NOT NULL DEFAULT 0,
  peso_total        NUMERIC NOT NULL DEFAULT 0,
  payload_carrinho  JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE  orcamentos IS 'Orçamentos salvos - cada registro é um projeto com link único';
COMMENT ON COLUMN orcamentos.status IS 'Status: Pendente, Aprovado, Expirado';
COMMENT ON COLUMN orcamentos.payload_carrinho IS 'JSON com todos os itens do orçamento: [{id, nome, qtd, preco, peso}]';

-- ────────────────────────────────────────────
-- 4. SEED: Regras de Frete Iniciais
-- ────────────────────────────────────────────
INSERT INTO regras_frete (estado, zona, multiplicador, valor_minimo) VALUES
  ('SP', 'CAPITAL',     1.2, 100),
  ('SP', 'INTERIOR 1',  1.4, 100),
  ('SP', 'INTERIOR 2',  1.6, 100),
  ('MG', 'CAPITAL',     1.4, 150),
  ('MG', 'INTERIOR 1',  1.6, 150),
  ('MG', 'INTERIOR 2',  1.8, 150),
  ('BA', 'CAPITAL',     3.0, 280),
  ('BA', 'INTERIOR 1',  3.0, 280),
  ('BA', 'INTERIOR 2',  4.0, 280)
ON CONFLICT (estado, zona) DO NOTHING;

-- ────────────────────────────────────────────
-- 5. RLS (Row Level Security) - Políticas
-- ────────────────────────────────────────────
ALTER TABLE produtos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE regras_frete ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos   ENABLE ROW LEVEL SECURITY;

-- Permitir leitura pública de produtos e frete (necessário para vitrine)
CREATE POLICY "Produtos visíveis publicamente"
  ON produtos FOR SELECT USING (true);

CREATE POLICY "Regras de frete visíveis publicamente"
  ON regras_frete FOR SELECT USING (true);

-- Orçamentos: leitura pública (para o link do cliente) + inserção anônima
CREATE POLICY "Orçamentos visíveis por link"
  ON orcamentos FOR SELECT USING (true);

CREATE POLICY "Permitir criação de orçamentos"
  ON orcamentos FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de status do orçamento"
  ON orcamentos FOR UPDATE USING (true);
