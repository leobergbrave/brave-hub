-- Qualificação do cliente antes do orçamento (MEDDIC-lite, 5 perguntas).
--
-- Por que existe: a análise de 08/09/2026 mostrou que a conversão cai de ~20%
-- para 9,8% nos orçamentos acima de R$ 20 mil e para 8,4% nos de 10+ itens.
-- O sistema tirou o atrito de orçar — e com ele sumiu a qualificação que o
-- atrito forçava. Estas respostas voltam a colocá-la no caminho.
--
-- Por que tabela própria e não coluna em `clientes`: a qualificação muda com o
-- tempo e o histórico é o sinal. Um cliente que respondeu "sem prazo" em maio e
-- "inauguro em outubro" agora é um lead quente — com coluna única isso se perde.

create table if not exists public.qualificacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes(id) on delete set null,
  -- Telefone é a chave real: o painel do FSS/WhatsApp qualifica a partir da
  -- conversa aberta, muitas vezes antes de o cliente existir em `clientes`.
  telefone text,
  nome text,
  respostas jsonb not null default '{}'::jsonb,
  consultor text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Só dígitos, sem DDI: o mesmo formato que `acharTelefones()` do userscript
-- entrega. Guardar formatado faria a busca falhar em silêncio.
create index if not exists qualificacoes_telefone_idx on public.qualificacoes (telefone);
create index if not exists qualificacoes_cliente_idx  on public.qualificacoes (cliente_id);

alter table public.qualificacoes enable row level security;

-- Mesma postura das outras tabelas operacionais do HUB: o admin não tem login,
-- e o painel do userscript fala pelo servidor. Leitura/escrita liberadas para a
-- chave pública, como em orcamentos_salvos.
create policy "qualificacoes leitura" on public.qualificacoes for select using (true);
create policy "qualificacoes escrita"  on public.qualificacoes for all using (true) with check (true);

comment on table public.qualificacoes is
  'Respostas das 5 perguntas qualificadoras (métrica, decisor, critério, dor, prazo). Alimenta a sugestão de pacote no Gerador e o gatilho do follow-up.';
