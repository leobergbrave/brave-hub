-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração: Orçamentos Modelo (Templates)
-- Templates de orçamento para acesso rápido
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.orcamentos_modelo (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome        TEXT NOT NULL,
  descricao   TEXT,
  itens       JSONB NOT NULL DEFAULT '[]'::jsonb,
  consultor   TEXT,
  criado_em   TIMESTAMPTZ DEFAULT now(),
  ativo       BOOLEAN DEFAULT true
);

COMMENT ON TABLE  public.orcamentos_modelo IS 'Templates de orçamento para acesso rápido';
COMMENT ON COLUMN public.orcamentos_modelo.nome IS 'Nome do modelo. Ex: Kit Básico CrossFit';
COMMENT ON COLUMN public.orcamentos_modelo.itens IS 'Lista de itens do modelo. [{produto_id, quantidade}]';

-- RLS
ALTER TABLE public.orcamentos_modelo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Modelos visíveis publicamente"
  ON public.orcamentos_modelo FOR SELECT USING (true);

CREATE POLICY "Permitir criação de modelos"
  ON public.orcamentos_modelo FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de modelos"
  ON public.orcamentos_modelo FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de modelos"
  ON public.orcamentos_modelo FOR DELETE USING (true);
