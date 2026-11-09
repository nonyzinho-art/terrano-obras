-- Linha de base do cronograma de cada contrato (orçamento aprovado).
-- A primeira é criada automaticamente quando as datas planejadas são definidas; as seguintes
-- só pela coordenação, com justificativa. A mais recente é a vigente; as anteriores ficam no histórico.
create table public.budget_baselines (
 id uuid primary key default gen_random_uuid(),
 budget_id uuid not null,
 work_id uuid not null,
 planned_start date not null,
 planned_end date not null check(planned_end>=planned_start),
 reason text not null default '' check(length(reason)<=2000),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default clock_timestamp(),
 foreign key(budget_id,work_id) references public.budgets(id,work_id) on delete cascade
);
create index budget_baselines_budget_idx on public.budget_baselines(budget_id,created_at desc);
create index budget_baselines_work_idx on public.budget_baselines(work_id);
create index budget_baselines_creator_idx on public.budget_baselines(created_by);
alter table public.budget_baselines enable row level security;
revoke all on public.budget_baselines from anon,authenticated;
grant select on public.budget_baselines to authenticated;
grant all on public.budget_baselines to service_role;
create policy budget_baselines_read on public.budget_baselines for select to authenticated using(public.can_access_work(work_id,false));

-- Primeira linha de base: automática quando o contrato ganha datas planejadas.
create function private.budget_first_baseline() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.planned_start is not null and new.planned_end is not null
  and not exists(select 1 from public.budget_baselines where budget_id=new.id) then
  insert into public.budget_baselines(budget_id,work_id,planned_start,planned_end,reason,created_by)
  values(new.id,new.work_id,new.planned_start,new.planned_end,'Linha de base inicial',auth.uid());
 end if;
 return null;
end $$;
revoke all on function private.budget_first_baseline() from public,anon,authenticated;
create trigger budget_first_baseline after insert or update of planned_start,planned_end on public.budgets
 for each row execute function private.budget_first_baseline();

-- Contratos que já tinham datas: as datas atuais viram a linha de base inicial.
insert into public.budget_baselines(budget_id,work_id,planned_start,planned_end,reason,created_by,created_at)
select id,work_id,planned_start,planned_end,'Linha de base inicial (datas já cadastradas)',null,now()
from public.budgets where planned_start is not null and planned_end is not null;

-- Nova linha de base: somente coordenação, com as datas planejadas atuais e justificativa.
create function private.set_budget_baseline(p_budget uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); b public.budgets%rowtype; role_name text; last public.budget_baselines%rowtype; ident uuid;
begin
 if u is null then raise exception 'Entre na sua conta';end if;
 select role into role_name from public.app_profiles where user_id=u and active;
 select * into b from public.budgets where id=p_budget for update;
 if not found or role_name is null or not private.allowed_work(u,b.work_id,true) then raise exception 'Sem acesso a este orçamento';end if;
 if role_name not in ('administrador','diretor','coordenador_obras') then raise exception 'Somente coordenador de obras, diretor ou administrador pode atualizar a linha de base';end if;
 if b.status<>'aprovado' or b.planned_start is null or b.planned_end is null then raise exception 'Defina as datas planejadas do orçamento antes';end if;
 if p_reason is null or length(trim(p_reason))<10 or length(p_reason)>2000 then raise exception 'Informe a justificativa, com pelo menos 10 caracteres';end if;
 select * into last from public.budget_baselines where budget_id=p_budget order by created_at desc,id desc limit 1;
 if found and last.planned_start=b.planned_start and last.planned_end=b.planned_end then raise exception 'As datas atuais já são a linha de base vigente';end if;
 insert into public.budget_baselines(budget_id,work_id,planned_start,planned_end,reason,created_by)
 values(p_budget,b.work_id,b.planned_start,b.planned_end,trim(p_reason),u) returning id into ident;
 return ident;
end $$;
revoke all on function private.set_budget_baseline(uuid,text) from public,anon,authenticated;
grant execute on function private.set_budget_baseline(uuid,text) to authenticated;
create function public.set_budget_baseline(p_budget uuid,p_reason text) returns uuid
language sql security invoker set search_path='' as $$select private.set_budget_baseline(p_budget,p_reason)$$;
revoke all on function public.set_budget_baseline(uuid,text) from public,anon;
grant execute on function public.set_budget_baseline(uuid,text) to authenticated;
