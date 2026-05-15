-- ─────────────────────────────────────────────────────────────────
-- Auto-link leads → links_rapidos por telefone
-- Conecta automaticamente um lead ao link_rapido gerado pelo BotConversa
-- usando o telefone como chave de correspondência.
-- ─────────────────────────────────────────────────────────────────

-- 1. Função do trigger
CREATE OR REPLACE FUNCTION fn_autolink_lead_to_link_rapido()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.telefone_lead IS NULL OR NEW.telefone_lead = '' THEN
    RETURN NEW;
  END IF;

  -- Encontra o lead mais recente com o mesmo telefone (normalizado) e sem link ainda
  UPDATE leads
  SET
    link_rapido_codigo = NEW.codigo,
    atualizado_em      = now()
  WHERE id = (
    SELECT id FROM leads
    WHERE regexp_replace(telefone,        '\D', '', 'g')
        = regexp_replace(NEW.telefone_lead, '\D', '', 'g')
      AND link_rapido_codigo IS NULL
    ORDER BY criado_em DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

-- 2. Trigger: dispara após INSERT em links_rapidos
DROP TRIGGER IF EXISTS trg_autolink_lead_to_link_rapido ON links_rapidos;
CREATE TRIGGER trg_autolink_lead_to_link_rapido
  AFTER INSERT ON links_rapidos
  FOR EACH ROW
  EXECUTE FUNCTION fn_autolink_lead_to_link_rapido();

-- 3. Backfill: conecta registros existentes que ainda não estão vinculados
UPDATE leads l
SET
  link_rapido_codigo = lr.codigo,
  atualizado_em      = now()
FROM (
  -- Para cada número de telefone pega o link_rapido mais recente
  SELECT DISTINCT ON (regexp_replace(telefone_lead, '\D', '', 'g'))
    codigo,
    regexp_replace(telefone_lead, '\D', '', 'g') AS tel_norm
  FROM links_rapidos
  WHERE telefone_lead IS NOT NULL
    AND telefone_lead <> ''
  ORDER BY regexp_replace(telefone_lead, '\D', '', 'g'), criado_em DESC
) lr
WHERE regexp_replace(l.telefone, '\D', '', 'g') = lr.tel_norm
  AND l.link_rapido_codigo IS NULL;
