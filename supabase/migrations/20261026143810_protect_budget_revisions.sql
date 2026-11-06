-- Prevent automatic replacement of budgets that already own operational history.
-- No historical rows, quantities, prices or existing baseline choices are rewritten.
create function private.guard_budget_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare previous public.budgets%rowtype; u uuid:=auth.uid();
begin
 if tg_op='UPDATE' and new.work_id=old.work_id and new.name=old.name and new.revision=old.revision and new.status=old.status then return new; end if;
 if new.status<>'aprovado' and tg_op='INSERT' then return new; end if;
 if u is not null then
  if not private.allowed_work(u,new.work_id,true) then raise exception 'Sem acesso a esta obra'; end if;
 elsif current_setting('role',true) not in ('service_role','postgres') then raise exception 'Entre na sua conta'; end if;
 if tg_op='UPDATE' then
  if exists(select 1 from public.budget_measurements where budget_id=old.id)
   or exists(select 1 from public.daily_reports where budget_id=old.id)
   or exists(select 1 from public.photos where budget_id=old.id) then
   raise exception 'Este orçamento possui histórico vinculado. A identidade e a revisão não podem ser alteradas sem reconciliação';
  end if;
 end if;
 if new.status<>'aprovado' then return new; end if;
 -- Serialize with production inserts, which acquire the same budget row lock.
 for previous in select * from public.budgets where work_id=new.work_id and lower(trim(name))=lower(trim(new.name)) and id<>new.id order by id for update loop
  if exists(select 1 from public.budget_measurements where budget_id=previous.id)
   or exists(select 1 from public.daily_reports where budget_id=previous.id)
   or exists(select 1 from public.photos where budget_id=previous.id) then
   raise exception 'Revisão bloqueada: esta frente já possui medições ou registros vinculados. Preserve o orçamento atual até reconciliar os itens e a execução';
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.guard_budget_revision() from public,anon,authenticated;
create trigger protect_budget_revision before insert or update of work_id,name,revision,status on public.budgets for each row execute function private.guard_budget_revision();

create function private.guard_budget_history_link() returns trigger language plpgsql security definer set search_path='' as $$
declare b public.budgets%rowtype; u uuid:=auth.uid();
begin
 if new.budget_id is null then return new; end if;
 if tg_op='UPDATE' and new.budget_id is not distinct from old.budget_id then return new; end if;
 if u is not null then
  if not private.allowed_work(u,new.work_id,true) then raise exception 'Sem acesso a esta obra'; end if;
 elsif current_setting('role',true) not in ('service_role','postgres') then raise exception 'Entre na sua conta'; end if;
 select * into b from public.budgets where id=new.budget_id and work_id=new.work_id for update;
 if not found then raise exception 'Orçamento inválido para esta obra'; end if;
 if exists(select 1 from public.budgets newer where newer.work_id=b.work_id and lower(trim(newer.name))=lower(trim(b.name)) and newer.status='aprovado' and (newer.revision>b.revision or (newer.revision=b.revision and newer.updated_at>b.updated_at))) then
  raise exception 'Esta revisão foi substituída. Selecione o orçamento aprovado atual antes de registrar';
 end if;
 return new;
end $$;
revoke all on function private.guard_budget_history_link() from public,anon,authenticated;
create trigger protect_measurement_budget_link before insert or update of budget_id on public.budget_measurements for each row execute function private.guard_budget_history_link();
create trigger protect_diary_budget_link before insert or update of budget_id on public.daily_reports for each row execute function private.guard_budget_history_link();
create trigger protect_photo_budget_link before insert or update of budget_id on public.photos for each row execute function private.guard_budget_history_link();
