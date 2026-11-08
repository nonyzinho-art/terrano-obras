-- Replanejamento mensal (etapa A): cada revisão mensal é um plano novo, criado a partir da
-- última aprovada. O engenheiro da obra edita o rascunho e envia; a coordenação aprova ou devolve.
alter table public.cost_plans
 add column status text not null default 'aprovada' check(status in ('rascunho','enviada','aprovada','devolvida')),
 add column competence date check(competence is null or extract(day from competence)=1),
 add column base_plan_id uuid references public.cost_plans(id),
 add column version integer not null default 1 check(version>0),
 add column submitted_by uuid references auth.users(id),
 add column submitted_at timestamptz,
 add column decided_by uuid references auth.users(id),
 add column decided_at timestamptz,
 add column decision_comment text not null default '' check(length(decision_comment)<=5000);
update public.cost_plans set competence=date_trunc('month',imported_at at time zone 'America/Sao_Paulo')::date where competence is null;
alter table public.cost_plans alter column competence set default (date_trunc('month',now() at time zone 'America/Sao_Paulo'))::date;
alter table public.cost_plans alter column competence set not null;
create unique index cost_plans_one_open_revision on public.cost_plans(work_id) where status in ('rascunho','enviada','devolvida');
create index cost_plans_base_idx on public.cost_plans(base_plan_id);
create index cost_plans_submitter_idx on public.cost_plans(submitted_by);
create index cost_plans_decider_idx on public.cost_plans(decided_by);
alter table public.cost_plan_items add column note text not null default '' check(length(note)<=2000);

create table public.cost_plan_month_values (
 plan_id uuid not null,
 work_id uuid not null,
 position integer not null check(position>=0),
 month date not null check(extract(day from month)=1),
 amount numeric(16,2) not null check(abs(amount)<1e13),
 primary key(plan_id,position,month),
 foreign key(plan_id,work_id) references public.cost_plans(id,work_id) on delete cascade,
 foreign key(plan_id,position) references public.cost_plan_items(plan_id,position) on delete cascade
);
create index cost_plan_month_values_work_idx on public.cost_plan_month_values(work_id);
alter table public.cost_plan_month_values enable row level security;
revoke all on public.cost_plan_month_values from anon,authenticated;
grant select on public.cost_plan_month_values to authenticated;
grant all on public.cost_plan_month_values to service_role;
create policy cost_plan_month_values_read on public.cost_plan_month_values for select to authenticated using(public.can_access_work(work_id,false));

create function private.cost_plan_revision_action(p_action text,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); role_name text; p public.cost_plans%rowtype; base public.cost_plans%rowtype;
 target uuid; work uuid; comp date; it jsonb; v jsonb; comment text;
begin
 if u is null then raise exception 'Entre na sua conta';end if;
 select role into role_name from public.app_profiles where user_id=u and active;
 if role_name is null then raise exception 'Acesso não liberado';end if;

 if p_action='criar' then
  work:=(p_payload->>'work_id')::uuid;
  comp:=(p_payload->>'competence')::date;
  if work is null or comp is null or extract(day from comp)<>1 then raise exception 'Informe a obra e o mês da revisão';end if;
  if not private.allowed_work(u,work,true) then raise exception 'Sem acesso para planejar esta obra';end if;
  perform pg_advisory_xact_lock(hashtextextended('cost_plan'||work::text,0));
  if exists(select 1 from public.cost_plans where work_id=work and status in ('rascunho','enviada','devolvida')) then raise exception 'Esta obra já tem uma revisão em andamento';end if;
  select * into base from public.cost_plans where work_id=work and status='aprovada' order by revision desc limit 1;
  if not found then raise exception 'Importe o planejamento da obra antes da primeira revisão';end if;
  insert into public.cost_plans(work_id,name,revision,source_filename,stages,import_key,status,competence,base_plan_id)
  values(work,'Revisão '||to_char(comp,'MM/YYYY'),(select max(revision)+1 from public.cost_plans where work_id=work),null,base.stages,gen_random_uuid(),'rascunho',comp,base.id)
  returning id into target;
  insert into public.cost_plan_items(plan_id,work_id,position,parent_position,item_code,insumo,service,stage,viability,committed,to_contract,adjustment,barter,forecast,start_month,duration_months,note)
  select target,work,position,parent_position,item_code,insumo,service,stage,viability,committed,to_contract,adjustment,barter,forecast,start_month,duration_months,''
  from public.cost_plan_items where plan_id=base.id;
  if jsonb_typeof(p_payload->'values')='array' and jsonb_array_length(p_payload->'values')>0 then
   insert into public.cost_plan_month_values(plan_id,work_id,position,month,amount)
   select target,work,(x->>'position')::integer,(x->>'month')::date,round((x->>'amount')::numeric,2)
   from jsonb_array_elements(p_payload->'values') x where round((x->>'amount')::numeric,2)<>0;
  else
   insert into public.cost_plan_month_values(plan_id,work_id,position,month,amount)
   select target,work,position,month,amount from public.cost_plan_month_values where plan_id=base.id and month>=comp;
  end if;
  return target;
 end if;

 target:=(p_payload->>'plan_id')::uuid;
 select * into p from public.cost_plans where id=target for update;
 if not found or not private.allowed_work(u,p.work_id,false) then raise exception 'Revisão não encontrada';end if;
 if p.version is distinct from (p_payload->>'version')::integer then raise exception 'Esta revisão foi alterada por outra pessoa. Atualize a página';end if;

 if p_action in ('salvar','enviar','descartar') then
  if not private.allowed_work(u,p.work_id,true) then raise exception 'Sem acesso para planejar esta obra';end if;
  if p.status not in ('rascunho','devolvida') then raise exception 'Somente rascunho ou revisão devolvida pode ser alterada';end if;
 end if;

 if p_action='salvar' then
  if jsonb_typeof(p_payload->'values') is distinct from 'array' or jsonb_typeof(p_payload->'items') is distinct from 'array' then raise exception 'Dados da revisão inválidos';end if;
  if jsonb_array_length(p_payload->'values')>50000 then raise exception 'Quantidade de valores excedida';end if;
  for it in select * from jsonb_array_elements(p_payload->'items') loop
   if length(coalesce(it->>'note',''))>2000 then raise exception 'Justificativa muito longa';end if;
   update public.cost_plan_items set
    forecast=round((it->>'forecast')::numeric,2),
    to_contract=round((it->>'forecast')::numeric,2)-committed-barter,
    note=trim(coalesce(it->>'note','')),
    start_month=coalesce((it->>'start_month')::date,start_month),
    duration_months=coalesce((it->>'duration_months')::integer,duration_months)
   where plan_id=p.id and position=(it->>'position')::integer and parent_position is null;
  end loop;
  delete from public.cost_plan_month_values where plan_id=p.id;
  for v in select * from jsonb_array_elements(p_payload->'values') loop
   if round((v->>'amount')::numeric,2)<>0 then
    insert into public.cost_plan_month_values(plan_id,work_id,position,month,amount)
    values(p.id,p.work_id,(v->>'position')::integer,(v->>'month')::date,round((v->>'amount')::numeric,2));
   end if;
  end loop;
  update public.cost_plans set version=version+1,status='rascunho' where id=p.id;
 elsif p_action='enviar' then
  update public.cost_plans set status='enviada',submitted_by=u,submitted_at=now(),version=version+1 where id=p.id;
 elsif p_action='descartar' then
  delete from public.cost_plans where id=p.id;
 elsif p_action in ('aprovar','devolver') then
  if role_name not in ('administrador','diretor','coordenador_obras') then raise exception 'Somente coordenador de obras, diretor ou administrador pode aprovar o planejamento';end if;
  if p.status<>'enviada' then raise exception 'A revisão precisa estar enviada para aprovação';end if;
  comment:=trim(coalesce(p_payload->>'comment',''));
  if p_action='devolver' and length(comment)<5 then raise exception 'Explique o motivo da devolução';end if;
  if length(comment)>5000 then raise exception 'Comentário muito longo';end if;
  update public.cost_plans set status=case when p_action='aprovar' then 'aprovada' else 'devolvida' end,
   decided_by=u,decided_at=now(),decision_comment=comment,version=version+1 where id=p.id;
 else
  raise exception 'Ação inválida';
 end if;
 return p.id;
end $$;
revoke all on function private.cost_plan_revision_action(text,jsonb) from public,anon,authenticated;
grant execute on function private.cost_plan_revision_action(text,jsonb) to authenticated;
create function public.cost_plan_revision_action(p_action text,p_payload jsonb) returns uuid
language sql security invoker set search_path='' as $$select private.cost_plan_revision_action(p_action,p_payload)$$;
revoke all on function public.cost_plan_revision_action(text,jsonb) from public,anon;
grant execute on function public.cost_plan_revision_action(text,jsonb) to authenticated;
