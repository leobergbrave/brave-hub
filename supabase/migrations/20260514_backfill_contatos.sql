-- ─────────────────────────────────────────────
-- BACKFILL: importa todos os contatos existentes
-- ─────────────────────────────────────────────

-- 1. Leads (WhatsApp)
INSERT INTO contatos (nome, telefone, telefone_norm, email, origem, status, criado_em)
SELECT
  l.nome,
  l.telefone,
  regexp_replace(l.telefone, '[^0-9]', '', 'g') AS telefone_norm,
  l.email,
  'whatsapp' AS origem,
  CASE l.momento_compra
    WHEN 'quente' THEN 'quente'
    WHEN 'morno'  THEN 'morno'
    ELSE 'frio'
  END AS status,
  l.criado_em
FROM leads l
WHERE regexp_replace(l.telefone, '[^0-9]', '', 'g') != ''
ON CONFLICT (telefone_norm) WHERE telefone_norm IS NOT NULL AND telefone_norm != ''
DO NOTHING;

-- 2. Orçamentos salvos (clientes com telefone preenchido)
INSERT INTO contatos (nome, telefone, telefone_norm, origem, criado_em)
SELECT
  o.cliente                                              AS nome,
  o.payload->>'telefoneCliente'                          AS telefone,
  regexp_replace(o.payload->>'telefoneCliente', '[^0-9]', '', 'g') AS telefone_norm,
  'orcamento'                                            AS origem,
  o.criado_em
FROM orcamentos_salvos o
WHERE
  o.payload->>'telefoneCliente' IS NOT NULL
  AND regexp_replace(o.payload->>'telefoneCliente', '[^0-9]', '', 'g') != ''
ON CONFLICT (telefone_norm) WHERE telefone_norm IS NOT NULL AND telefone_norm != ''
DO NOTHING;

-- Resultado
SELECT origem, COUNT(*) FROM contatos GROUP BY origem ORDER BY origem;
