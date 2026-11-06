
alter table public.budgets add column revision integer not null default 1;
alter table public.budgets add column source_filename text;
alter table public.budgets add column import_key uuid unique;
alter table public.budget_items add column quantity_pending boolean not null default false;
alter table public.budget_items add column unit_price_pending boolean not null default false;
alter table public.budget_items add column source_row integer;
alter table public.budget_items add column source_total numeric(24,4);
create function public.import_budget(p_key uuid,p_work uuid,p_name text,p_filename text,p_items jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare b uuid; rev integer; it jsonb;
begin
 if auth.uid() is null or not public.can_access_work(p_work,true) then raise exception 'Sem acesso para importar nesta obra';end if;
 if length(trim(p_name))=0 or length(p_name)>120 then raise exception 'Informe a frente';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 or jsonb_array_length(p_items)>10000 then raise exception 'Quantidade de itens inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_work::text||lower(trim(p_name)),0));
 select id into b from public.budgets where import_key=p_key and work_id=p_work;
 if found then return b;end if;
 select coalesce(max(revision),0)+1 into rev from public.budgets where work_id=p_work and lower(name)=lower(trim(p_name));
 insert into public.budgets(work_id,name,revision,source_filename,import_key) values(p_work,trim(p_name),rev,p_filename,p_key) returning id into b;
 for it in select * from jsonb_array_elements(p_items) loop
  if length(trim(coalesce(it->>'code','')))=0 or length(trim(coalesce(it->>'description','')))=0 or length(trim(coalesce(it->>'unit','')))=0 then raise exception 'Item sem código, descrição ou unidade';end if;
  insert into public.budget_items(work_id,budget_id,code,"group",description,unit,planned_quantity,unit_price,quantity_pending,unit_price_pending,source_row,source_total)
  values(p_work,b,it->>'code',coalesce(it->>'group',''),it->>'description',it->>'unit',
  coalesce((it->>'quantity')::numeric,0),coalesce((it->>'unitPrice')::numeric,0),it->>'quantity' is null,it->>'unitPrice' is null,
  (it->>'row')::integer,(it->>'sourceTotal')::numeric);
 end loop;
 return b;
end $$;
revoke all on function public.import_budget(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.import_budget(uuid,uuid,text,text,jsonb) to authenticated;

