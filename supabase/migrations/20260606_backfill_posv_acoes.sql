-- BACKFILL: posv_acoes para orçamentos aprovados existentes
-- Cria a agenda de follow-up para todos os pedidos já aprovados no sistema
-- Execute DEPOIS de 20260606_ciclo_cliente.sql
-- Idempotente: usa INSERT ... ON CONFLICT DO NOTHING

INSERT INTO posv_acoes (orcamento_id, cliente_telefone, cliente_nome, estrategia_id, prevista_em)
SELECT
  o.id                                  AS orcamento_id,
  o.payload->>'telefoneCliente'         AS cliente_telefone,
  o.cliente                             AS cliente_nome,
  e.estrategia_id,
  CASE e.estrategia_id
    WHEN 'montagem'   THEN COALESCE(o.aprovado_em, o.criado_em)
    WHEN 'checkin30'  THEN COALESCE(o.aprovado_em, o.criado_em) + INTERVAL '30 days'
    WHEN 'checkin60'  THEN COALESCE(o.aprovado_em, o.criado_em) + INTERVAL '60 days'
    WHEN 'checkin90'  THEN COALESCE(o.aprovado_em, o.criado_em) + INTERVAL '90 days'
    -- avaliacao e nps aguardam data_entrega; se já entregue, usa data_entrega
    WHEN 'avaliacao'  THEN o.data_entrega
    WHEN 'nps'        THEN CASE WHEN o.data_entrega IS NOT NULL
                              THEN o.data_entrega + INTERVAL '7 days'
                              ELSE NULL END
    ELSE NULL
  END AS prevista_em
FROM
  orcamentos_salvos o
  CROSS JOIN (
    VALUES
      ('montagem'),
      ('checkin30'),
      ('checkin60'),
      ('checkin90'),
      ('avaliacao'),
      ('nps')
  ) AS e(estrategia_id)
WHERE
  o.payload->>'status' = 'Aprovado'
ON CONFLICT (orcamento_id, estrategia_id) DO NOTHING;

-- Atualizar clientes existentes que já têm compras mas status_ciclo ainda é 'lead'
UPDATE clientes
SET
  status_ciclo = 'cliente_ativo',
  atualizado_em = now()
WHERE
  total_compras > 0
  AND (status_ciclo IS NULL OR status_ciclo = 'lead');
