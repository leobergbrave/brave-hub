-- ─────────────────────────────────────────────
-- BANCO GLOBAL DE CONTATOS
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS contatos (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nome            text,
  telefone        text,
  telefone_norm   text,        -- apenas dígitos, usado para deduplicação
  email           text,
  empresa         text,
  origem          text        NOT NULL DEFAULT 'manual',  -- 'manual','screenshot','whatsapp','orcamento'
  status          text        NOT NULL DEFAULT 'frio',    -- 'frio','morno','quente'
  tags            text[]      NOT NULL DEFAULT '{}',
  historico       jsonb       NOT NULL DEFAULT '[]',
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

-- Índice único parcial para deduplicação por telefone
CREATE UNIQUE INDEX IF NOT EXISTS idx_contatos_tel_norm
  ON contatos (telefone_norm)
  WHERE telefone_norm IS NOT NULL AND telefone_norm != '';

ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contatos_allow_all" ON contatos FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- TRIGGER: auto-save quando lead chega via WhatsApp
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_lead_to_contatos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_norm text;
BEGIN
  v_norm := regexp_replace(coalesce(NEW.telefone, ''), '[^0-9]', '', 'g');
  IF length(v_norm) >= 8 THEN
    INSERT INTO contatos (nome, telefone, telefone_norm, origem)
    VALUES (NEW.nome, NEW.telefone, v_norm, 'whatsapp')
    ON CONFLICT (telefone_norm) WHERE telefone_norm IS NOT NULL AND telefone_norm != ''
    DO UPDATE SET atualizado_em = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_to_contatos ON leads;
CREATE TRIGGER trg_lead_to_contatos
  AFTER INSERT ON leads
  FOR EACH ROW EXECUTE FUNCTION sync_lead_to_contatos();

-- ─────────────────────────────────────────────
-- TRIGGER: auto-save quando orçamento é salvo
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_orcamento_to_contatos()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_tel  text;
  v_norm text;
BEGIN
  v_tel  := NEW.payload->>'telefoneCliente';
  v_norm := regexp_replace(coalesce(v_tel, ''), '[^0-9]', '', 'g');
  IF length(v_norm) >= 8 THEN
    INSERT INTO contatos (nome, telefone, telefone_norm, origem)
    VALUES (NEW.cliente, v_tel, v_norm, 'orcamento')
    ON CONFLICT (telefone_norm) WHERE telefone_norm IS NOT NULL AND telefone_norm != ''
    DO UPDATE SET atualizado_em = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamento_to_contatos ON orcamentos_salvos;
CREATE TRIGGER trg_orcamento_to_contatos
  AFTER INSERT ON orcamentos_salvos
  FOR EACH ROW EXECUTE FUNCTION sync_orcamento_to_contatos();
