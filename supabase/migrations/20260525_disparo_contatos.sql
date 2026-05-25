-- ── Disparo em Massa de Contatos ─────────────────────────────────────────────

-- Configurações do disparo (editáveis pelo admin)
CREATE TABLE IF NOT EXISTS disparo_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hora_inicio   text NOT NULL DEFAULT '08:00',
  hora_fim      text NOT NULL DEFAULT '18:00',
  dias_semana   int[] NOT NULL DEFAULT '{1,2,3,4,5}', -- 1=Seg, 5=Sex, 7=Dom
  max_por_dia   int NOT NULL DEFAULT 50,
  delay_min_min int NOT NULL DEFAULT 1,
  delay_max_min int NOT NULL DEFAULT 30,
  webhook_url   text DEFAULT 'https://new-backend.botconversa.com.br/api/v1/webhooks-automation/catch/178259/NKpV3tjdv3AS/',
  atualizado_em timestamptz DEFAULT now()
);

INSERT INTO disparo_config DEFAULT VALUES;

-- Campanhas de disparo
CREATE TABLE IF NOT EXISTS disparo_campanhas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           text NOT NULL,
  status         text NOT NULL DEFAULT 'ativa', -- ativa|pausada|concluida
  total_contatos int DEFAULT 0,
  enviados_hoje  int DEFAULT 0,
  enviados_total int DEFAULT 0,
  falhas_total   int DEFAULT 0,
  ultima_data    date,
  criado_em      timestamptz DEFAULT now()
);

-- Fila de disparos
CREATE TABLE IF NOT EXISTS disparo_fila (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES disparo_campanhas(id) ON DELETE CASCADE,
  nome        text,
  telefone    text NOT NULL,
  status      text NOT NULL DEFAULT 'pending', -- pending|sent|failed
  send_after  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  erro        text,
  criado_em   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disparo_fila_pending
  ON disparo_fila (status, send_after) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_disparo_fila_campanha
  ON disparo_fila (campanha_id, status, send_after);

-- Agendamento via cron-job.org (externo) → POST /api/disparo-sender na Vercel a cada minuto.
