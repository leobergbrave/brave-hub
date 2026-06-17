-- Migration: Tabela de Clientes
-- Execute manualmente no SQL Editor do Supabase

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT,
  email TEXT,
  tipo_pessoa TEXT DEFAULT 'F',   -- F = Física, J = Jurídica
  cpf_cnpj TEXT,
  tipo_negocio TEXT,               -- box, academia, studio, uso_proprio, clube, outro
  dados_fiscais JSONB DEFAULT '{}',-- endereço, IE, nome fantasia, data nascimento
  origem TEXT DEFAULT 'manual',    -- cadastro_web | orcamento_aprovado | bling | fiscal_form
  bling_contato_id BIGINT,
  data_primeira_compra TIMESTAMPTZ,
  data_ultima_compra TIMESTAMPTZ,
  total_compras INT DEFAULT 0,
  total_gasto NUMERIC(12,2) DEFAULT 0,
  criado_em TIMESTAMPTZ DEFAULT now(),
  atualizado_em TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_telefone   ON clientes(telefone);
CREATE INDEX IF NOT EXISTS idx_clientes_cpf_cnpj   ON clientes(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_clientes_email       ON clientes(email);
CREATE INDEX IF NOT EXISTS idx_clientes_tipo_negocio ON clientes(tipo_negocio);

-- Adicionar coluna cliente_id nos orçamentos para vincular (opcional, facilita histórico)
ALTER TABLE orcamentos_salvos ADD COLUMN IF NOT EXISTS cliente_id UUID REFERENCES clientes(id);
