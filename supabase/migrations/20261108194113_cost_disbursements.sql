-- Desembolso realizado (exportação "Desembolso" do UAU), agregado por insumo, mês e status.
-- Cada importação substitui a anterior na leitura; o histórico de importações é preservado.
create table public.cost_disbursement_imports (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 source_filename text,
 uau_work text not null default '',
 period_start date,
 period_end date,
 import_key uuid not null unique,
 imported_by uuid not null default auth.uid() references auth.users(id),
 imported_at timestamptz not null default now(),
 unique(id,work_id)
);
create table public.cost_disbursements (
 id uuid primary key default gen_random_uuid(),
 import_id uuid not null,
 work_id uuid not null,
 insumo text not null check(length(insumo) between 1 and 40),
 month date not null check(extract(day from month)=1),
 status text not null check(status in ('pago','a_pagar')),
 amount numeric(16,2) not null,
 unique(import_id,insumo,month,status),
 foreign key(import_id,work_id) references public.cost_disbursement_imports(id,work_id) on delete cascade
);
create index cost_disbursement_imports_work_idx on public.cost_disbursement_imports(work_id,imported_at desc);
create index cost_disbursement_imports_importer_idx on public.cost_disbursement_imports(imported_by);
create index cost_disbursements_work_idx on public.cost_disbursements(work_id);
alter table public.cost_disbursement_imports enable row level security;
alter table public.cost_disbursements enable row level security;
revoke all on public.cost_disbursement_imports,public.cost_disbursements from anon,authenticated;
grant select on public.cost_disbursement_imports,public.cost_disbursements to authenticated;
grant all on public.cost_disbursement_imports,public.cost_disbursements to service_role;
create policy cost_disbursement_imports_read on public.cost_disbursement_imports for select to authenticated using(public.can_access_work(work_id,false));
create policy cost_disbursements_read on public.cost_disbursements for select to authenticated using(public.can_access_work(work_id,false));

create function private.import_cost_disbursements(p_key uuid,p_work uuid,p_filename text,p_uau_work text,p_rows jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare batch uuid; it jsonb; first_month date; last_month date;
begin
 if auth.uid() is null or not private.current_work_access(p_work,true) then raise exception 'Sem acesso para importar o desembolso desta obra';end if;
 if p_key is null then raise exception 'Identificação da importação obrigatória';end if;
 if p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 20000 then raise exception 'Quantidade de linhas inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended('cost_disbursement'||p_work::text,0));
 select id into batch from public.cost_disbursement_imports where import_key=p_key and work_id=p_work;
 if found then return batch;end if;
 select min((r->>'month')::date),max((r->>'month')::date) into first_month,last_month from jsonb_array_elements(p_rows) r;
 insert into public.cost_disbursement_imports(work_id,source_filename,uau_work,period_start,period_end,import_key)
 values(p_work,left(p_filename,255),left(coalesce(p_uau_work,''),40),first_month,last_month,p_key) returning id into batch;
 for it in select * from jsonb_array_elements(p_rows) loop
  if abs((it->>'amount')::numeric)>=1e13 then raise exception 'Valor inválido';end if;
  insert into public.cost_disbursements(import_id,work_id,insumo,month,status,amount)
  values(batch,p_work,left(trim(it->>'insumo'),40),(it->>'month')::date,it->>'status',(it->>'amount')::numeric);
 end loop;
 return batch;
end $$;
revoke all on function private.import_cost_disbursements(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function private.import_cost_disbursements(uuid,uuid,text,text,jsonb) to authenticated;
create function public.import_cost_disbursements(p_key uuid,p_work uuid,p_filename text,p_uau_work text,p_rows jsonb)
returns uuid language sql security invoker set search_path='' as $$select private.import_cost_disbursements(p_key,p_work,p_filename,p_uau_work,p_rows)$$;
revoke all on function public.import_cost_disbursements(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.import_cost_disbursements(uuid,uuid,text,text,jsonb) to authenticated;
