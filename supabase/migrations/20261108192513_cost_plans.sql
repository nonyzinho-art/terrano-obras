-- Planejamento de custos da obra (fase 1): importado da planilha "CUSTO DE OBRAS".
-- Cada importação cria uma nova revisão; as anteriores ficam preservadas.
create table public.cost_plans (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 revision integer not null check(revision>0),
 source_filename text,
 stages jsonb not null default '[]' check(jsonb_typeof(stages)='array'),
 import_key uuid not null unique,
 imported_by uuid not null default auth.uid() references auth.users(id),
 imported_at timestamptz not null default now(),
 unique(work_id,revision),
 unique(id,work_id)
);
create table public.cost_plan_items (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null,
 work_id uuid not null,
 position integer not null check(position>=0),
 parent_position integer check(parent_position>=0),
 item_code text not null default '',
 insumo text not null default '',
 service text not null check(length(trim(service)) between 1 and 200),
 stage smallint check(stage between 1 and 20),
 viability numeric(16,2) not null default 0,
 committed numeric(16,2) not null default 0,
 to_contract numeric(16,2) not null default 0,
 adjustment numeric(16,2) not null default 0,
 barter numeric(16,2) not null default 0,
 forecast numeric(16,2),
 start_month date,
 duration_months integer check(duration_months between 0 and 240),
 unique(plan_id,position),
 foreign key(plan_id,work_id) references public.cost_plans(id,work_id) on delete cascade
);
create index cost_plans_work_idx on public.cost_plans(work_id,revision desc);
create index cost_plans_importer_idx on public.cost_plans(imported_by);
create index cost_plan_items_plan_idx on public.cost_plan_items(plan_id,position);
create index cost_plan_items_work_idx on public.cost_plan_items(work_id);
alter table public.cost_plans enable row level security;
alter table public.cost_plan_items enable row level security;
revoke all on public.cost_plans,public.cost_plan_items from anon,authenticated;
grant select on public.cost_plans,public.cost_plan_items to authenticated;
grant all on public.cost_plans,public.cost_plan_items to service_role;
create policy cost_plans_read on public.cost_plans for select to authenticated using(public.can_access_work(work_id,false));
create policy cost_plan_items_read on public.cost_plan_items for select to authenticated using(public.can_access_work(work_id,false));

create function private.import_cost_plan(p_key uuid,p_work uuid,p_name text,p_filename text,p_stages jsonb,p_items jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare plan uuid; rev integer; it jsonb; pos integer:=0; amount_keys text[]:=array['viability','committed','toContract','adjustment','barter','forecast']; k text;
begin
 if auth.uid() is null or not private.current_work_access(p_work,true) then raise exception 'Sem acesso para importar o planejamento desta obra';end if;
 if p_key is null or p_name is null or length(trim(p_name)) not between 1 and 120 then raise exception 'Informe o nome da revisão';end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 2000 then raise exception 'Quantidade de linhas inválida';end if;
 if p_stages is null or jsonb_typeof(p_stages)<>'array' or jsonb_array_length(p_stages)>20 then raise exception 'Etapas inválidas';end if;
 perform pg_advisory_xact_lock(hashtextextended('cost_plan'||p_work::text,0));
 select id into plan from public.cost_plans where import_key=p_key and work_id=p_work;
 if found then return plan;end if;
 select coalesce(max(revision),0)+1 into rev from public.cost_plans where work_id=p_work;
 insert into public.cost_plans(work_id,name,revision,source_filename,stages,import_key)
 values(p_work,trim(p_name),rev,left(p_filename,255),p_stages,p_key) returning id into plan;
 for it in select * from jsonb_array_elements(p_items) loop
  if length(trim(coalesce(it->>'service','')))=0 then raise exception 'Linha % sem frente de serviço',pos+1;end if;
  foreach k in array amount_keys loop
   if it->>k is not null and abs((it->>k)::numeric)>=1e13 then raise exception 'Valor inválido na linha %',pos+1;end if;
  end loop;
  insert into public.cost_plan_items(plan_id,work_id,position,parent_position,item_code,insumo,service,stage,viability,committed,to_contract,adjustment,barter,forecast,start_month,duration_months)
  values(plan,p_work,pos,(it->>'parent')::integer,left(coalesce(it->>'code',''),40),left(coalesce(it->>'insumo',''),40),left(trim(it->>'service'),200),(it->>'stage')::smallint,
   coalesce((it->>'viability')::numeric,0),coalesce((it->>'committed')::numeric,0),coalesce((it->>'toContract')::numeric,0),
   coalesce((it->>'adjustment')::numeric,0),coalesce((it->>'barter')::numeric,0),(it->>'forecast')::numeric,
   (it->>'startMonth')::date,(it->>'duration')::integer);
  pos:=pos+1;
 end loop;
 return plan;
end $$;
revoke all on function private.import_cost_plan(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function private.import_cost_plan(uuid,uuid,text,text,jsonb,jsonb) to authenticated;
create function public.import_cost_plan(p_key uuid,p_work uuid,p_name text,p_filename text,p_stages jsonb,p_items jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.import_cost_plan(p_key,p_work,p_name,p_filename,p_stages,p_items)$$;
revoke all on function public.import_cost_plan(uuid,uuid,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.import_cost_plan(uuid,uuid,text,text,jsonb,jsonb) to authenticated;
