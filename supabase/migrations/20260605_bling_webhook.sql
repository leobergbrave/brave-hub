-- BRAVE HUB: Bling Reverse Sync
-- Adiciona suporte a orçamentos importados via webhook/sync do Bling

-- Identifica orçamentos criados pelo Bling (webhook ou sync manual)
ALTER TABLE public.orcamentos_salvos
  ADD COLUMN IF NOT EXISTS bling_origem boolean DEFAULT false;

COMMENT ON COLUMN public.orcamentos_salvos.bling_origem IS
  'true quando o orcamento foi importado do Bling via webhook ou sync manual';

-- Token secreto para validar webhooks do Bling
ALTER TABLE public.bling_config
  ADD COLUMN IF NOT EXISTS webhook_token text;

COMMENT ON COLUMN public.bling_config.webhook_token IS
  'Token secreto configurado no Bling para validar autenticidade dos webhooks recebidos';
