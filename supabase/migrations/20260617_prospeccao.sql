-- ═══════════════════════════════════════════════════════
-- BRAVE HUB — Prospecção Inteligente de Potenciais Clientes
-- Executar no SQL Editor do Supabase manualmente
-- ═══════════════════════════════════════════════════════

-- ────────────────────────────────────────────
-- 1. TABELA DE POTENCIAIS CLIENTES (Leads Frios)
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.potenciais_clientes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_empresa        TEXT NOT NULL,
  segmento            TEXT,
  telefone            TEXT,
  email               TEXT,
  site                TEXT,
  cidade              TEXT,
  estado              TEXT,
  origem              TEXT DEFAULT 'raspagem',
  status              TEXT DEFAULT 'prospecto', -- prospecto | em_contato | convertido | descartado
  dados_personalizados JSONB DEFAULT '{}'::jsonb, -- ganchos de abordagem, perfil, análises de IA
  criado_em           TIMESTAMPTZ DEFAULT now(),
  atualizado_em       TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.potenciais_clientes IS 'Base de leads frios prospectados via raspagem de dados';
COMMENT ON COLUMN public.potenciais_clientes.status IS 'Etapa da prospecção: prospecto | em_contato | convertido | descartado';
COMMENT ON COLUMN public.potenciais_clientes.dados_personalizados IS 'Payload JSON de enriquecimento contendo abordagens personalizadas de IA';

-- Índices para otimização de filtros
CREATE INDEX IF NOT EXISTS idx_potenciais_clientes_status ON public.potenciais_clientes(status);
CREATE INDEX IF NOT EXISTS idx_potenciais_clientes_estado ON public.potenciais_clientes(estado);
CREATE INDEX IF NOT EXISTS idx_potenciais_clientes_cidade ON public.potenciais_clientes(cidade);
CREATE INDEX IF NOT EXISTS idx_potenciais_clientes_email  ON public.potenciais_clientes(email);

-- Trigger para atualizar atualizado_em
CREATE OR REPLACE FUNCTION set_potenciais_clientes_atualizado_em()
RETURNS TRIGGER LANGUAGE plpgsql as $$
BEGIN
  new.atualizado_em = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tr_potenciais_clientes_atualizado_em ON public.potenciais_clientes;
CREATE TRIGGER tr_potenciais_clientes_atualizado_em
  BEFORE UPDATE ON public.potenciais_clientes
  FOR EACH ROW EXECUTE FUNCTION set_potenciais_clientes_atualizado_em();

-- ────────────────────────────────────────────
-- 2. TABELA DE CONFIGURAÇÕES DE PROSPECÇÃO
-- ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospeccao_config (
  id                  SERIAL PRIMARY KEY,
  apify_token         TEXT,
  gemini_key          TEXT,
  instantly_key       TEXT,
  prompt_personalizacao TEXT,
  updated_at          TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.prospeccao_config IS 'Chaves de API e prompts usados no motor de prospecção';

-- Seed: Garantir que a linha de configuração com id 1 exista
INSERT INTO public.prospeccao_config (id, prompt_personalizacao)
VALUES (
  1,
  'Você é um consultor comercial especialista em equipamentos fitness da Brave Equipment. Escreva um gancho de abordagem curto e persuasivo no WhatsApp para esta academia, comentando algo específico sobre o local deles e oferecendo nossos equipamentos profissionais (Remo, Esteira Curva, SkiErg, Storm Bike).'
)
ON CONFLICT (id) DO NOTHING;

-- Trigger para atualizar updated_at de prospeccao_config
CREATE OR REPLACE FUNCTION set_prospeccao_config_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql as $$
BEGIN
  new.updated_at = now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS tr_prospeccao_config_updated_at ON public.prospeccao_config;
CREATE TRIGGER tr_prospeccao_config_updated_at
  BEFORE UPDATE ON public.prospeccao_config
  FOR EACH ROW EXECUTE FUNCTION set_prospeccao_config_updated_at();

-- ────────────────────────────────────────────
-- 3. POLÍTICAS RLS (Row Level Security)
-- ────────────────────────────────────────────
ALTER TABLE public.potenciais_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospeccao_config ENABLE ROW LEVEL SECURITY;

-- Permite acesso total para leitura, inserção e atualização (padrão do app admin)
DROP POLICY IF EXISTS "Permitir tudo em potenciais_clientes" ON public.potenciais_clientes;
CREATE POLICY "Permitir tudo em potenciais_clientes"
  ON public.potenciais_clientes FOR ALL
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir tudo em prospeccao_config" ON public.prospeccao_config;
CREATE POLICY "Permitir tudo em prospeccao_config"
  ON public.prospeccao_config FOR ALL
  USING (true) WITH CHECK (true);
