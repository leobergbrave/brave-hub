-- ─────────────────────────────────────────────────────────────────
-- Pipeline de Leads v2: novos status respondeu + aprovado
-- ─────────────────────────────────────────────────────────────────

-- Atualiza comentário do campo status para refletir novo pipeline
COMMENT ON COLUMN leads.status IS
  'novo | fluxo_disparado | respondeu | link_aberto | qualificando | orcamento_gerado | convertido | aprovado';

-- Timestamp de quando o lead respondeu pela primeira vez
ALTER TABLE leads ADD COLUMN IF NOT EXISTS respondeu_em timestamptz;

-- Timestamp de quando o lead foi marcado como aprovado
ALTER TABLE leads ADD COLUMN IF NOT EXISTS aprovado_em timestamptz;
