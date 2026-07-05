-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração: Propostas Premium por Lead
-- Cria a tabela que o renderizador /pp/{slug}
-- (api/proposta-lead.js) já esperava mas que nunca
-- havia sido criada no banco.
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.propostas_leads (
  id                    UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug                  TEXT NOT NULL UNIQUE,
  lead_nome             TEXT NOT NULL DEFAULT 'Cliente',
  objetivo              TEXT,
  mensagem_personalizada TEXT,
  equipamentos          JSONB NOT NULL DEFAULT '[]'::jsonb,
  validade_em           DATE,
  vendedor_telefone     TEXT,
  status                TEXT NOT NULL DEFAULT 'enviada',   -- enviada | aberta
  aberturas             INTEGER NOT NULL DEFAULT 0,
  primeira_abertura_em  TIMESTAMPTZ,
  ultima_abertura_em    TIMESTAMPTZ,
  modelo_id             UUID REFERENCES public.orcamentos_modelo(id) ON DELETE SET NULL,
  telefone_lead         TEXT,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.propostas_leads              IS 'Propostas premium (página /pp/{slug}) geradas por lead, com rastreamento de abertura.';
COMMENT ON COLUMN public.propostas_leads.equipamentos IS 'Itens exibidos [{nome, descricao, specs[], imagem_url, preco, preco_avista, parcelas, preco_parcela, destaque}].';
COMMENT ON COLUMN public.propostas_leads.modelo_id    IS 'Modelo (orcamentos_modelo) de origem, quando gerada a partir de um modelo importado do Bling.';

CREATE INDEX IF NOT EXISTS propostas_leads_slug_idx      ON public.propostas_leads (slug);
CREATE INDEX IF NOT EXISTS propostas_leads_criado_em_idx ON public.propostas_leads (criado_em DESC);

-- RLS (padrão do projeto: acesso público controlado; escrita real acontece via service role nas APIs).
ALTER TABLE public.propostas_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Propostas visíveis publicamente"
  ON public.propostas_leads FOR SELECT USING (true);

CREATE POLICY "Permitir criação de propostas"
  ON public.propostas_leads FOR INSERT WITH CHECK (true);

CREATE POLICY "Permitir atualização de propostas"
  ON public.propostas_leads FOR UPDATE USING (true);

CREATE POLICY "Permitir exclusão de propostas"
  ON public.propostas_leads FOR DELETE USING (true);
