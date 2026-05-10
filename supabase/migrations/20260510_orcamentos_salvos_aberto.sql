alter table orcamentos_salvos
  add column if not exists aberto boolean not null default false;
