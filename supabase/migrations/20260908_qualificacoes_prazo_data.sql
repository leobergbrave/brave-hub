-- A resposta da pergunta 5 ("tem alguma data na frente?") interpretada como data.
--
-- Por que uma coluna e nao um parse na hora de usar: o motor de follow-up roda
-- a cada minuto (pega carona no tique do disparo-sender). Reinterpretar texto
-- livre a cada passagem seria caro e instavel. Interpretamos uma vez, na
-- gravacao (interpretarPrazo em api/_qualificacao.js), e a automacao le a data.
--
-- Fica NULL quando a resposta nao traz data reconhecivel ("ainda nao sei", "to
-- reformando"). Null nao e falha: o lead so nao ganha prioridade e segue na
-- ordem normal da fila.

alter table public.qualificacoes
  add column if not exists prazo_data date;

comment on column public.qualificacoes.prazo_data is
  'Data de inauguracao/reforma extraida da resposta 5. Alimenta a prioridade do follow-up automatico. NULL = sem data reconhecida.';

-- A fila do follow-up varre por data proxima; sem indice isso vira varredura
-- cheia a cada minuto.
create index if not exists qualificacoes_prazo_idx
  on public.qualificacoes (prazo_data) where prazo_data is not null;
