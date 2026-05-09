-- Tabela de leads para gestão do pipeline de vendas
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text not null,
  email text,
  momento_compra text not null default 'morno', -- 'quente' | 'morno' | 'frio'
  produtos_interesse text[] not null default '{}',
  status text not null default 'novo',
  -- novo | fluxo_disparado | link_aberto | orcamento_gerado | negociando | convertido | perdido
  consultor text not null default 'Léo Berg',
  observacoes text,
  link_rapido_codigo text references links_rapidos(codigo) on delete set null,
  orcamento_slug text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Atualiza atualizado_em automaticamente
create or replace function set_leads_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger leads_atualizado_em
  before update on leads
  for each row execute function set_leads_atualizado_em();

-- RLS: somente usuários autenticados lêem/escrevem
alter table leads enable row level security;

create policy "leads_autenticados" on leads
  for all using (true) with check (true);

-- Índices úteis
create index leads_status_idx on leads(status);
create index leads_consultor_idx on leads(consultor);
create index leads_criado_em_idx on leads(criado_em desc);
