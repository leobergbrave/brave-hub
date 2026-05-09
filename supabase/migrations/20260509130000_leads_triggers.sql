-- ══════════════════════════════════════════════════════
-- TRIGGER 1: Quando links_rapidos.aberto = true
--            → lead status = 'link_aberto'
-- ══════════════════════════════════════════════════════
create or replace function sync_lead_link_aberto()
returns trigger language plpgsql as $$
begin
  -- Só age quando aberto muda de false para true
  if new.aberto = true and (old.aberto is distinct from true) then
    update leads
    set status = 'link_aberto'
    where link_rapido_codigo = new.codigo
      and status in ('novo', 'fluxo_disparado'); -- não retroage em status mais avançados
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_link_aberto on links_rapidos;
create trigger trg_lead_link_aberto
  after update on links_rapidos
  for each row execute function sync_lead_link_aberto();


-- ══════════════════════════════════════════════════════
-- TRIGGER 2: Quando um orcamento_salvo é inserido
--            → lead status = 'orcamento_gerado'
--            → lead.orcamento_slug = slug do orçamento
--
-- A ligação é feita via links_rapidos:
-- orcamentos_salvos não guarda o codigo diretamente,
-- mas o lead guarda link_rapido_codigo e o link_rapido
-- guarda telefone_lead. Usamos o telefone + nome para cruzar.
-- Porém a forma mais direta é via payload.telefoneCliente
-- e nome do cliente.
-- ══════════════════════════════════════════════════════
create or replace function sync_lead_orcamento_gerado()
returns trigger language plpgsql as $$
declare
  v_lead_id uuid;
  v_telefone text;
begin
  -- Extrai o telefone do payload se existir
  v_telefone := new.payload->>'telefoneCliente';

  -- Tenta encontrar o lead pelo telefone (prioridade)
  if v_telefone is not null and v_telefone != '' then
    select id into v_lead_id
    from leads
    where telefone = v_telefone
      and status not in ('convertido', 'perdido')
    order by criado_em desc
    limit 1;
  end if;

  -- Fallback: tenta pelo nome do cliente
  if v_lead_id is null then
    select id into v_lead_id
    from leads
    where lower(nome) = lower(new.cliente)
      and status not in ('convertido', 'perdido')
    order by criado_em desc
    limit 1;
  end if;

  if v_lead_id is not null then
    update leads
    set status = 'orcamento_gerado',
        orcamento_slug = new.slug
    where id = v_lead_id
      and status in ('novo', 'fluxo_disparado', 'link_aberto');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lead_orcamento_gerado on orcamentos_salvos;
create trigger trg_lead_orcamento_gerado
  after insert on orcamentos_salvos
  for each row execute function sync_lead_orcamento_gerado();


-- ══════════════════════════════════════════════════════
-- TRIGGER 3: Quando orcamentos_salvos.payload->>'status'
--            é atualizado para 'Aprovado'
--            → lead status = 'convertido'
-- ══════════════════════════════════════════════════════
create or replace function sync_lead_convertido()
returns trigger language plpgsql as $$
declare
  v_lead_id uuid;
  v_status_novo text;
  v_status_old text;
begin
  v_status_novo := new.payload->>'status';
  v_status_old  := old.payload->>'status';

  if v_status_novo = 'Aprovado' and (v_status_old is distinct from 'Aprovado') then
    select id into v_lead_id
    from leads
    where orcamento_slug = new.slug
    limit 1;

    if v_lead_id is not null then
      update leads set status = 'convertido' where id = v_lead_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_lead_convertido on orcamentos_salvos;
create trigger trg_lead_convertido
  after update on orcamentos_salvos
  for each row execute function sync_lead_convertido();
