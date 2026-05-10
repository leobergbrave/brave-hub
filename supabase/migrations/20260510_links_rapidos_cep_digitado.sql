-- ══════════════════════════════════════════════════════
-- Adiciona coluna cep_digitado em links_rapidos
-- ══════════════════════════════════════════════════════
alter table links_rapidos
  add column if not exists cep_digitado boolean not null default false;


-- ══════════════════════════════════════════════════════
-- TRIGGER 4: Quando links_rapidos.cep_digitado = true
--            → lead status = 'qualificando'
-- ══════════════════════════════════════════════════════
create or replace function sync_lead_qualificando()
returns trigger language plpgsql as $$
begin
  -- Só age quando cep_digitado muda de false para true
  if new.cep_digitado = true and (old.cep_digitado is distinct from true) then
    update leads
    set status = 'qualificando'
    where link_rapido_codigo = new.codigo
      and status in ('novo', 'fluxo_disparado', 'link_aberto'); -- não retroage em status mais avançados
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lead_qualificando on links_rapidos;
create trigger trg_lead_qualificando
  after update on links_rapidos
  for each row execute function sync_lead_qualificando();
