-- Migration: Ciclo de Vida do Cliente
-- Adiciona status_ciclo em clientes e cria tabela posv_acoes
-- Execute manualmente no SQL Editor do Supabase

-- ── 1. status_ciclo na tabela clientes ────────────────────────────────────────
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS status_ciclo TEXT DEFAULT 'lead';

-- lead          → contato que ainda não fechou venda
-- cliente_ativo → fechou ao menos uma venda aprovada
-- cliente_inativo → sem compra há mais de 180 dias (atualizar manualmente/cron)

COMMENT ON COLUMN clientes.status_ciclo IS
  'Etapa do ciclo de vida: lead | cliente_ativo | cliente_inativo';

CREATE INDEX IF NOT EXISTS idx_clientes_status_ciclo ON clientes(status_ciclo);

-- ── 2. Tabela posv_acoes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posv_acoes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id    TEXT        NOT NULL,
  cliente_telefone TEXT,
  cliente_nome    TEXT,
  estrategia_id   TEXT        NOT NULL,
  -- montagem | avaliacao | nps | checkin30 | checkin60 | checkin90 | promocao
  prevista_em     TIMESTAMPTZ,          -- quando a ação deve ser executada
  executado_em    TIMESTAMPTZ,          -- quando foi efetivamente executada
  canal           TEXT,                 -- whatsapp | email | ligacao
  obs             TEXT,
  criado_em       TIMESTAMPTZ DEFAULT now(),
  atualizado_em   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posv_acoes_orcamento_id     ON posv_acoes(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_posv_acoes_estrategia_id    ON posv_acoes(estrategia_id);
CREATE INDEX IF NOT EXISTS idx_posv_acoes_prevista_em      ON posv_acoes(prevista_em);
CREATE INDEX IF NOT EXISTS idx_posv_acoes_executado_em     ON posv_acoes(executado_em);
CREATE INDEX IF NOT EXISTS idx_posv_acoes_cliente_telefone ON posv_acoes(cliente_telefone);

-- Constraint: uma estratégia por orçamento (idempotência)
ALTER TABLE posv_acoes
  DROP CONSTRAINT IF EXISTS uq_posv_acoes_orc_estrategia;
ALTER TABLE posv_acoes
  ADD CONSTRAINT uq_posv_acoes_orc_estrategia
  UNIQUE (orcamento_id, estrategia_id);

-- ── 3. RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE posv_acoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'posv_acoes'
  ) THEN
    CREATE POLICY "Permitir tudo em posv_acoes"
      ON posv_acoes FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Mesma policy para clientes (se ainda não existir)
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'clientes'
  ) THEN
    CREATE POLICY "Permitir tudo em clientes"
      ON clientes FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
