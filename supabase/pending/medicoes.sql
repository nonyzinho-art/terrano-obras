alter table public.budgets add column planned_start date;
alter table public.budgets add column planned_end date;
alter table public.budgets add constraint budget_plan_dates check ((planned_start is null and planned_end is null) or (planned_start is not null and planned_end is not null and planned_end>=planned_start));
alter table public.budget_items add constraint budget_items_measurement_key unique(id,budget_id,work_id);
create table public.budget_measurements (
 id uuid primary key, budget_id uuid not null, work_id uuid not null,
 period_start date not null, period_end date not null check(period_end>=period_start),
 notes text not null default '' check(length(notes)<=5000),
 status text not null default 'rascunho' check(status in ('rascunho','aprovada','cancelada')),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 approved_by uuid references auth.users(id), approved_at timestamptz,
 revision integer not null default 1,
 unique(id,budget_id,work_id), foreign key(budget_id,work_id) references public.budgets(id,work_id)
);
create table public.budget_measurement_items (
 id uuid primary key default gen_random_uuid(), measurement_id uuid not null,
 budget_id uuid not null, work_id uuid not null, budget_item_id uuid not null,
 quantity numeric(20,4) not null check(quantity>0),
 unit_price numeric not null check(unit_price>=0), planned_quantity numeric not null check(planned_quantity>=0),
 unique(measurement_id,budget_item_id),
 foreign key(measurement_id,budget_id,work_id) references public.budget_measurements(id,budget_id,work_id),
 foreign key(budget_item_id,budget_id,work_id) references public.budget_items(id,budget_id,work_id)
);
create index budget_measurements_work_idx on public.budget_measurements(work_id,budget_id,status,period_end);
create index budget_measurement_items_item_idx on public.budget_measurement_items(budget_item_id);
create index budget_measurement_items_work_idx on public.budget_measurement_items(work_id,budget_id);
alter table public.budget_measurements enable row level security;
alter table public.budget_measurement_items enable row level security;
revoke all on public.budget_measurements,public.budget_measurement_items from anon,authenticated;
grant select on public.budget_measurements,public.budget_measurement_items to authenticated;
grant all on public.budget_measurements,public.budget_measurement_items to service_role;
create policy measurements_read on public.budget_measurements for select to authenticated using(public.can_access_work(work_id,false));
create policy measurement_items_read on public.budget_measurement_items for select to authenticated using(public.can_access_work(work_id,false));

create function private.budget_measurement_action(p_action text,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); b public.budgets%rowtype; m public.budget_measurements%rowtype;
 ident uuid:=(p_payload->>'id')::uuid; bid uuid:=(p_payload->>'budget_id')::uuid;
 role_name text; first_day date; last_day date; raw record; it public.budget_items%rowtype; qty numeric; used numeric; can_approve boolean;
begin
 if u is null then raise exception 'Entre na sua conta';end if;
 select role into role_name from public.app_profiles where user_id=u and active;
 select * into b from public.budgets where id=bid for update;
 if not found or role_name is null or not private.allowed_work(u,b.work_id,true) then raise exception 'Sem acesso a este orçamento';end if;
 can_approve:=role_name in ('administrador','diretor','coordenador_obras');
 if exists(select 1 from public.budgets newer where newer.work_id=b.work_id and lower(trim(newer.name))=lower(trim(b.name)) and newer.status='aprovado' and newer.revision>b.revision) then raise exception 'Use a revisão aprovada mais recente deste orçamento';end if;
 if p_action='planejar' then
  first_day:=(p_payload->>'planned_start')::date;last_day:=(p_payload->>'planned_end')::date;
  if b.status<>'aprovado' or first_day is null or last_day is null or last_day<first_day or not exists(select 1 from public.works where id=b.work_id and first_day>=start_date and last_day<=end_date) then raise exception 'Defina datas válidas dentro do período da obra';end if;
  update public.budgets set planned_start=first_day,planned_end=last_day,updated_at=now() where id=bid;return bid;
 end if;
 if ident is null then raise exception 'Identificação da medição obrigatória';end if;
 select * into m from public.budget_measurements where id=ident for update;
 if found and (m.budget_id<>bid or m.status<>'rascunho') then raise exception 'Esta medição não pode ser alterada';end if;
 if m.id is not null and m.created_by<>u and not can_approve then raise exception 'Somente o autor ou o responsável pela aprovação pode alterar esta medição';end if;
 if m.id is not null and p_action in ('aprovar','cancelar') and m.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Esta medição foi alterada. Atualize e confira a versão salva antes de continuar';end if;
 if p_action='salvar' then
  if b.status<>'aprovado' or b.execution_status<>'em_execucao' then raise exception 'Selecione um orçamento aprovado em execução';end if;
  if m.id is not null and m.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Esta medição foi alterada por outra pessoa. Atualize a página';end if;
  first_day:=(p_payload->>'period_start')::date;last_day:=(p_payload->>'period_end')::date;
  if first_day is null or last_day is null or last_day<first_day or last_day>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe um período válido, sem datas futuras';end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')=0 then raise exception 'Informe ao menos uma quantidade do período';end if;
  if jsonb_array_length(p_payload->'items')>10000 then raise exception 'Quantidade de itens excedida';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') x group by x->>'budget_item_id' having count(*)>1) then raise exception 'Item repetido na medição';end if;
  if m.id is null then
   insert into public.budget_measurements(id,budget_id,work_id,period_start,period_end,notes,created_by) values(ident,bid,b.work_id,first_day,last_day,coalesce(p_payload->>'notes',''),u);
  else
   update public.budget_measurements set period_start=first_day,period_end=last_day,notes=coalesce(p_payload->>'notes',''),revision=revision+1 where id=ident;
   delete from public.budget_measurement_items where measurement_id=ident;
  end if;
  for raw in select value from jsonb_array_elements(p_payload->'items') loop
   select * into it from public.budget_items where id=(raw.value->>'budget_item_id')::uuid and budget_id=bid and work_id=b.work_id for update;
   if not found or it.quantity_pending or it.unit_price_pending then raise exception 'Item inválido ou com quantidade/preço pendente';end if;
   qty:=(raw.value->>'quantity')::numeric;
   if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 or qty<>round(qty,4) then raise exception 'Use uma quantidade positiva com até quatro casas decimais';end if;
   select coalesce(sum(mi.quantity),0) into used from public.budget_measurement_items mi join public.budget_measurements mh on mh.id=mi.measurement_id where mi.budget_item_id=it.id and mh.status='aprovada';
   if qty+used>it.planned_quantity then raise exception 'A quantidade do item % excede o saldo orçado',it.code;end if;
   insert into public.budget_measurement_items(measurement_id,budget_id,work_id,budget_item_id,quantity,unit_price,planned_quantity) values(ident,bid,b.work_id,it.id,qty,it.unit_price,it.planned_quantity);
  end loop;
 elsif p_action='aprovar' then
  if not can_approve or m.id is null then raise exception 'Somente coordenador de obras, diretor ou administrador pode aprovar';end if;
  if b.status<>'aprovado' or b.execution_status<>'em_execucao' then raise exception 'Orçamento não está em execução';end if;
  if exists(select 1 from public.budget_measurements other where other.budget_id=bid and other.status='aprovada' and other.period_start<=m.period_end and other.period_end>=m.period_start) then raise exception 'O período coincide com uma medição já aprovada';end if;
  if not exists(select 1 from public.budget_measurement_items where measurement_id=ident) then raise exception 'Medição sem itens';end if;
  for raw in select * from public.budget_measurement_items where measurement_id=ident loop
   select * into it from public.budget_items where id=raw.budget_item_id for update;
   if it.quantity_pending or it.unit_price_pending or it.unit_price<>raw.unit_price or it.planned_quantity<>raw.planned_quantity then raise exception 'O orçamento mudou. Revise a medição antes de aprovar';end if;
   select coalesce(sum(mi.quantity),0) into used from public.budget_measurement_items mi join public.budget_measurements mh on mh.id=mi.measurement_id where mi.budget_item_id=it.id and mh.status='aprovada';
   if used+raw.quantity>it.planned_quantity then raise exception 'A quantidade do item % excede o saldo orçado',it.code;end if;
  end loop;
  update public.budget_measurements set status='aprovada',approved_by=u,approved_at=now(),revision=revision+1 where id=ident;
 elsif p_action='cancelar' then
  if m.id is null then raise exception 'Medição não encontrada';end if;
  update public.budget_measurements set status='cancelada',revision=revision+1 where id=ident;
 else raise exception 'Ação inválida';
 end if;
 return ident;
end $$;
revoke all on function private.budget_measurement_action(text,jsonb) from public,anon,authenticated;
grant execute on function private.budget_measurement_action(text,jsonb) to authenticated;
create function public.budget_measurement_action(p_action text,p_payload jsonb) returns uuid language sql security invoker set search_path='' as $$select private.budget_measurement_action(p_action,p_payload)$$;
revoke all on function public.budget_measurement_action(text,jsonb) from public,anon;
grant execute on function public.budget_measurement_action(text,jsonb) to authenticated;
