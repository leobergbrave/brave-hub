-- Migration: Formulário Fiscal Pós-Aprovação
-- Execute manualmente no SQL Editor do Supabase

ALTER TABLE orcamentos_salvos
  ADD COLUMN IF NOT EXISTS formulario_fiscal_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS dados_fiscais_recebidos_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orcamentos_fiscal_token
  ON orcamentos_salvos(formulario_fiscal_token);
