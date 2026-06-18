-- Migration: Automação Diária de Prospecção de Leads Frios (Brave Hub)
-- Data: 2026-06-18

-- 1. Adicionar colunas de controle de automação na tabela prospeccao_config
ALTER TABLE prospeccao_config 
ADD COLUMN IF NOT EXISTS automacao_ativa BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS automacao_nichos JSONB DEFAULT '["Box de CrossFit", "Estúdio de Treinamento", "Centro de Treinamento Hyrox", "Academia"]'::jsonb,
ADD COLUMN IF NOT EXISTS automacao_nicho_atual_index INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS automacao_cidades JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS automacao_cidade_atual_index INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS automacao_limite INT DEFAULT 25,
ADD COLUMN IF NOT EXISTS automacao_webhook_whatsapp TEXT;

-- 2. Criar a tabela de fila de disparos programados
CREATE TABLE IF NOT EXISTS prospeccao_fila_envio (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ DEFAULT now(),
    nome_empresa TEXT NOT NULL,
    telefone TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    agendado_para TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pendente', -- 'pendente' | 'enviado' | 'falhou'
    tentativas INT DEFAULT 0,
    erro_mensagem TEXT,
    enviado_em TIMESTAMPTZ,
    perfil_detectado TEXT,
    cidade_origem TEXT,
    segmento_origem TEXT
);

-- 3. Criar a tabela de histórico de execuções
CREATE TABLE IF NOT EXISTS prospeccao_historico (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    criado_em TIMESTAMPTZ DEFAULT now(),
    nicho_buscado TEXT NOT NULL,
    cidade_buscada TEXT NOT NULL,
    leads_encontrados INT DEFAULT 0,
    leads_qualificados INT DEFAULT 0,
    status TEXT DEFAULT 'sucesso', -- 'sucesso' | 'erro'
    detalhes TEXT
);

-- 4. Ativar RLS nas novas tabelas
ALTER TABLE prospeccao_fila_envio ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospeccao_historico ENABLE ROW LEVEL SECURITY;

-- 5. Criar políticas RLS liberadas para o painel administrativo manipular
DROP POLICY IF EXISTS "Permitir tudo na fila para o painel" ON prospeccao_fila_envio;
CREATE POLICY "Permitir tudo na fila para o painel" 
ON prospeccao_fila_envio FOR ALL 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir tudo no histórico para o painel" ON prospeccao_historico;
CREATE POLICY "Permitir tudo no histórico para o painel" 
ON prospeccao_historico FOR ALL 
USING (true) 
WITH CHECK (true);
