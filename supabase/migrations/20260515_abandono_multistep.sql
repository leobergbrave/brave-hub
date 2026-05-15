-- ─────────────────────────────────────────────────────────────────
-- Sequência multi-step de abandono + gatilho "abriu sem CEP"
-- + pré-preenchimento de estado/cidade
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE public.links_rapidos
  -- Rastreamento de estágio do abandono (0=não iniciado, 1=15min, 2=2h, 3=24h/encerrado)
  ADD COLUMN IF NOT EXISTS abandono_stage          int         NOT NULL DEFAULT 0,
  -- Quando enviar o próximo alerta de abandono
  ADD COLUMN IF NOT EXISTS proximo_alerta_em       timestamptz,
  -- Controle de alerta "abriu mas não digitou CEP"
  ADD COLUMN IF NOT EXISTS alerta_sem_cep_enviado  boolean     NOT NULL DEFAULT false,
  -- Quando o link foi aberto (para calcular janela de 30 min sem CEP)
  ADD COLUMN IF NOT EXISTS aberto_em               timestamptz,
  -- Localização do lead informada pelo BotConversa
  ADD COLUMN IF NOT EXISTS estado_lead             text,
  ADD COLUMN IF NOT EXISTS cidade_lead             text;

-- Índice para polling eficiente de alertas pendentes
CREATE INDEX IF NOT EXISTS idx_links_alerta_pendente
  ON links_rapidos (proximo_alerta_em)
  WHERE aberto = false AND proximo_alerta_em IS NOT NULL AND abandono_stage < 3;

-- Índice para polling "abriu sem CEP"
CREATE INDEX IF NOT EXISTS idx_links_sem_cep_alerta
  ON links_rapidos (aberto_em)
  WHERE aberto = true AND cep_digitado = false AND alerta_sem_cep_enviado = false;
