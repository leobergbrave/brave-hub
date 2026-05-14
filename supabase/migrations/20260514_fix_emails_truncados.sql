-- ─────────────────────────────────────────────
-- Corrige emails truncados nos contatos importados
-- Detecta: emails terminando em "..." ou "…" ou
--          domínios sem ponto (ex: @gmail sem .com)
-- ─────────────────────────────────────────────

UPDATE contatos
SET
  email = CASE
    WHEN email ILIKE '%@gmail%'        THEN split_part(email, '@', 1) || '@gmail.com'
    WHEN email ILIKE '%@hotm%'         THEN split_part(email, '@', 1) || '@hotmail.com'
    WHEN email ILIKE '%@yahoo.com.br%' THEN split_part(email, '@', 1) || '@yahoo.com.br'
    WHEN email ILIKE '%@yah%'          THEN split_part(email, '@', 1) || '@yahoo.com'
    WHEN email ILIKE '%@outlook%'      THEN split_part(email, '@', 1) || '@outlook.com'
    WHEN email ILIKE '%@icloud%'       THEN split_part(email, '@', 1) || '@icloud.com'
    WHEN email ILIKE '%@live%'         THEN split_part(email, '@', 1) || '@live.com'
    WHEN email ILIKE '%@bol%'          THEN split_part(email, '@', 1) || '@bol.com.br'
    WHEN email ILIKE '%@uol%'          THEN split_part(email, '@', 1) || '@uol.com.br'
    WHEN email ILIKE '%@terra%'        THEN split_part(email, '@', 1) || '@terra.com.br'
    ELSE NULL  -- domínio desconhecido: limpa o email inválido
  END,
  atualizado_em = now()
WHERE
  email IS NOT NULL
  AND (
    email LIKE '%...'   -- truncado com reticências ASCII
    OR email LIKE '%…'  -- truncado com reticências unicode
    OR (
      email LIKE '%@%'
      AND split_part(email, '@', 2) NOT LIKE '%.%'  -- domínio sem ponto (ex: @gmail)
    )
  );

-- Resultado: quantos foram corrigidos vs. zerados
SELECT
  CASE WHEN email IS NULL THEN 'domínio desconhecido (email zerado)' ELSE 'email completado' END AS resultado,
  COUNT(*)
FROM contatos
WHERE atualizado_em::date = CURRENT_DATE
GROUP BY 1;
