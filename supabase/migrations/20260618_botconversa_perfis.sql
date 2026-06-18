-- Migration: Adicionar integração BotConversa (webhook único com condições por perfil)
-- Executar manualmente no Supabase SQL Editor

ALTER TABLE prospeccao_config
  ADD COLUMN IF NOT EXISTS webhook_botconversa TEXT,
  ADD COLUMN IF NOT EXISTS mensagem_ativacao   TEXT DEFAULT 'Oi pessoal {{nome_empresa}}, tudo bem?';
