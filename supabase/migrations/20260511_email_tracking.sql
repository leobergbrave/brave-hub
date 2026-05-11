-- Histórico de emails enviados
create table if not exists emails_enviados (
  id          uuid        primary key default gen_random_uuid(),
  lead_id     uuid        references leads(id) on delete set null,
  destinatario text       not null,
  assunto     text,
  status      text        not null default 'enviado', -- enviado | falhou
  aberto      boolean     not null default false,
  aberto_em   timestamptz,
  criado_em   timestamptz not null default now()
);

-- Configurações editáveis do template de email
create table if not exists configuracoes_email (
  id                 int  primary key default 1,
  from_name          text not null default 'Brave Equipamentos',
  from_email         text not null default 'contato@alwaysprofit.com.br',
  assunto_template   text not null default '{{nome}}, recebemos seu contato! 🏋️',
  texto_saudacao     text not null default 'Recebemos seu contato! Já preparamos as informações dos equipamentos que você tem interesse.',
  texto_corpo        text not null default 'Nosso consultor {{consultor}} já foi notificado e entrará em contato em breve com uma proposta personalizada.',
  texto_botao        text not null default '💬 Falar com o Consultor agora',
  texto_rodape       text not null default 'Brave Equipamentos · São Paulo, SP',
  atualizado_em      timestamptz not null default now()
);

insert into configuracoes_email (id) values (1) on conflict (id) do nothing;
