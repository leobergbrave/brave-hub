-- ─────────────────────────────────────────────
-- SISTEMA DE FOLLOW-UP AUTOMÁTICO
-- ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS campanhas_followup (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  nome            text        NOT NULL,
  tipo            text        NOT NULL DEFAULT 'whatsapp',  -- 'whatsapp' | 'email'
  status          text        NOT NULL DEFAULT 'rascunho',  -- 'rascunho' | 'ativo' | 'pausado'
  template_base   text        NOT NULL DEFAULT '',
  variacoes       jsonb       NOT NULL DEFAULT '[]',        -- array de até 10 strings
  segmento        jsonb       NOT NULL DEFAULT '{}',        -- {status, origem, com_email, com_telefone}
  limite_por_dia  int         NOT NULL DEFAULT 50,
  intervalo_min   int         NOT NULL DEFAULT 1,           -- minutos
  intervalo_max   int         NOT NULL DEFAULT 30,          -- minutos
  horario_inicio  time        NOT NULL DEFAULT '08:00:00',
  horario_fim     time        NOT NULL DEFAULT '18:00:00',
  assunto_email   text,
  total_enviados  int         NOT NULL DEFAULT 0,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disparos_followup (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id     uuid        NOT NULL REFERENCES campanhas_followup(id) ON DELETE CASCADE,
  contato_id      uuid        NOT NULL REFERENCES contatos(id) ON DELETE CASCADE,
  variacao_idx    int         NOT NULL DEFAULT 0,
  status          text        NOT NULL DEFAULT 'pendente',  -- 'pendente' | 'enviado' | 'falhou'
  agendado_para   timestamptz NOT NULL DEFAULT now(),
  enviado_em      timestamptz,
  erro            text,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, contato_id)
);

CREATE INDEX IF NOT EXISTS idx_disparos_fila
  ON disparos_followup (campanha_id, agendado_para)
  WHERE status = 'pendente';

CREATE INDEX IF NOT EXISTS idx_disparos_enviados
  ON disparos_followup (campanha_id, enviado_em)
  WHERE status = 'enviado';

ALTER TABLE campanhas_followup ENABLE ROW LEVEL SECURITY;
ALTER TABLE disparos_followup  ENABLE ROW LEVEL SECURITY;
CREATE POLICY "followup_all"  ON campanhas_followup FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "disparos_all"  ON disparos_followup  FOR ALL USING (true) WITH CHECK (true);
