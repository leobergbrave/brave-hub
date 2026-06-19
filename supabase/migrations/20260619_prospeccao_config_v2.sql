-- Migration: colunas faltantes em prospeccao_config
-- Execute no SQL Editor do Supabase

ALTER TABLE prospeccao_config
  ADD COLUMN IF NOT EXISTS webhook_botconversa      TEXT,
  ADD COLUMN IF NOT EXISTS mensagem_ativacao        TEXT DEFAULT 'Oi pessoal {{nome_empresa}}, tudo bem?',
  ADD COLUMN IF NOT EXISTS instantly_campaign_id    TEXT;
