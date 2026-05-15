-- ─────────────────────────────────────────────────────────────────
-- Backfill por nome: conecta links_rapidos que ainda não têm lead
-- vinculado após o backfill por telefone (links sem telefone_lead).
-- ─────────────────────────────────────────────────────────────────

UPDATE leads l
SET
  link_rapido_codigo = sub.codigo,
  atualizado_em      = now()
FROM (
  -- Para cada nome único, pega o link_rapido mais recente ainda sem lead
  SELECT DISTINCT ON (lower(trim(lr.nome_lead)))
    lr.codigo,
    lower(trim(lr.nome_lead)) AS nome_norm
  FROM links_rapidos lr
  WHERE lr.nome_lead IS NOT NULL
    AND lr.nome_lead <> ''
    AND NOT EXISTS (
      SELECT 1 FROM leads WHERE link_rapido_codigo = lr.codigo
    )
  ORDER BY lower(trim(lr.nome_lead)), lr.criado_em DESC
) sub
WHERE lower(trim(l.nome)) = sub.nome_norm
  AND l.link_rapido_codigo IS NULL;
