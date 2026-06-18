-- Migration: Adicionar colunas de integração BotConversa por perfil
-- Executar manualmente no Supabase SQL Editor

ALTER TABLE prospeccao_config
  ADD COLUMN IF NOT EXISTS webhook_botconversa_crossfit TEXT,
  ADD COLUMN IF NOT EXISTS webhook_botconversa_hyrox    TEXT,
  ADD COLUMN IF NOT EXISTS webhook_botconversa_academia TEXT,
  ADD COLUMN IF NOT EXISTS webhook_botconversa_studio   TEXT,
  ADD COLUMN IF NOT EXISTS mensagem_ativacao            TEXT DEFAULT 'Oi, tudo bem? 👋';
