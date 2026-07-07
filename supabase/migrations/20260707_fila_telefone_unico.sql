-- ═══════════════════════════════════════════════
-- BRAVE HUB — Migração: telefone único na fila de prospecção
-- Garante que um mesmo telefone NUNCA seja contatado 2x.
-- ═══════════════════════════════════════════════

-- 1) Remove duplicatas atuais, mantendo a "melhor" linha por telefone:
--    prioridade → já enviado (0) antes de pendente (1); depois agendamento
--    mais cedo; depois menor id. Assim, se já foi contatado, mantém o enviado
--    e descarta os pendentes repetidos.
DELETE FROM public.prospeccao_fila_envio a
USING public.prospeccao_fila_envio b
WHERE a.telefone = b.telefone
  AND a.id <> b.id
  AND (
    (CASE WHEN b.status = 'enviado' THEN 0 ELSE 1 END, b.agendado_para, b.id)
    < (CASE WHEN a.status = 'enviado' THEN 0 ELSE 1 END, a.agendado_para, a.id)
  );

-- 2) Impede duplicatas no futuro a nível de banco: 1 telefone = 1 linha na fila.
--    Com isso, um INSERT de telefone repetido falha (unique_violation) e nenhuma
--    linha duplicada é criada, mesmo em reprocessamentos concorrentes do webhook.
CREATE UNIQUE INDEX IF NOT EXISTS prospeccao_fila_envio_telefone_key
  ON public.prospeccao_fila_envio (telefone);
