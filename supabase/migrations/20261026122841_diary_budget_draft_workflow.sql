alter table public.daily_reports add column revision integer not null default 1 check(revision>0);
alter table public.daily_reports add column updated_at timestamptz not null default now();
alter table public.daily_report_items alter column service_id drop not null;
alter table public.daily_report_items add column budget_item_id uuid;
alter table public.daily_report_items add column budget_id uuid;
alter table public.daily_report_items add constraint diary_item_reference check (
 num_nonnulls(service_id,budget_item_id)=1 and ((budget_item_id is null and budget_id is null) or (budget_item_id is not null and budget_id is not null))
);
alter table public.daily_report_items add constraint diary_item_budget_fk foreign key(budget_item_id,budget_id,work_id) references public.budget_items(id,budget_id,work_id);
alter table public.daily_report_items add constraint diary_item_report_budget_fk foreign key(daily_report_id,work_id,budget_id) references public.daily_reports(id,work_id,budget_id);
create index diary_item_budget_idx on public.daily_report_items(budget_item_id,budget_id,work_id);
create function private.bump_diary_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision:=old.revision+1;new.updated_at:=now();return new;end $$;
revoke all on function private.bump_diary_revision() from public,anon,authenticated;
create trigger diary_revision before update on public.daily_reports for each row execute function private.bump_diary_revision();

create table public.diary_changes (
 id uuid primary key default gen_random_uuid(),report_id uuid not null,work_id uuid not null,
 request_id uuid not null,actor_id uuid not null references auth.users(id),recorded_at timestamptz not null default now(),
 result_revision integer not null,before_data jsonb,after_data jsonb not null,
 unique(report_id,request_id),
 foreign key(work_id,report_id) references public.daily_reports(work_id,id)
);
create index diary_changes_work_idx on public.diary_changes(work_id,report_id);
alter table public.diary_changes enable row level security;
revoke all on public.diary_changes from public,anon,authenticated;
grant select on public.diary_changes to authenticated;
grant all on public.diary_changes to service_role;
create policy diary_changes_read on public.diary_changes for select to authenticated using(public.can_access_work(work_id,false));

create function private.save_diary_entry(p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid();ident uuid:=(p_payload->>'id')::uuid;wid uuid:=(p_payload->'report'->>'work_id')::uuid;
 req uuid:=(p_payload->>'request_id')::uuid;bid uuid:=nullif(p_payload->'report'->>'budget_id','')::uuid;
 m public.daily_reports%rowtype;role_name text;desired text:=p_payload->'report'->>'status';
 before_snapshot jsonb;after_snapshot jsonb;it jsonb;qty numeric;path text;previous public.diary_changes%rowtype;
 actor_name text;actor_email text;rev integer;report_date date:=(p_payload->'report'->>'date')::date;
begin
 if u is null or wid is null or not private.allowed_work(u,wid,true) then raise exception 'Sem acesso de escrita a esta obra';end if;
 if ident is null or req is null then raise exception 'Identificação do registro e do envio obrigatória';end if;
 select role into role_name from public.app_profiles where user_id=u and active;
 perform pg_advisory_xact_lock(hashtextextended(ident::text,0));
 select * into m from public.daily_reports where id=ident for update;
 if m.id is not null and (m.work_id<>wid or (m.created_by<>u and role_name not in ('administrador','diretor','coordenador_obras'))) then raise exception 'Somente o autor ou a gestão de obras pode complementar este diário';end if;
 select * into previous from public.diary_changes where report_id=ident and request_id=req;
 if previous.id is not null then
  if previous.actor_id<>u then raise exception 'Envio não pertence à sua conta';end if;
  return jsonb_build_object('id',ident,'revision',previous.result_revision,'request_id',req);
 end if;
 if m.id is not null and m.status<>'rascunho' then raise exception 'Diário finalizado é somente para consulta';end if;
 if m.id is not null and m.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Este diário foi alterado por outra pessoa. Reabra o registro e confira a versão atual';end if;
 if desired is null or desired not in ('rascunho','finalizado') then raise exception 'Situação do diário inválida';end if;
 if report_date is null or report_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe uma data válida, sem dia futuro';end if;
 if length(coalesce(p_payload->'report'->>'observations',''))>10000 then raise exception 'Observações excedem 10000 caracteres';end if;
 if bid is distinct from m.budget_id and m.budget_id is not null then raise exception 'O orçamento de um registro vinculado não pode ser trocado';end if;
 if bid is not null and not exists(select 1 from public.budgets b where b.id=bid and b.work_id=wid and b.status='aprovado' and (b.execution_status='em_execucao' or bid=m.budget_id)) then raise exception 'Selecione orçamento aprovado desta obra em execução';end if;
 if jsonb_typeof(p_payload->'items') is distinct from 'array' or jsonb_array_length(p_payload->'items')>10000 then raise exception 'Lista de serviços inválida';end if;
 if jsonb_typeof(p_payload->'photos') is distinct from 'array' or jsonb_array_length(p_payload->'photos')>50 then raise exception 'Lista de fotos inválida';end if;
 if jsonb_typeof(p_payload->'issues') is distinct from 'array' or jsonb_array_length(p_payload->'issues')>100 then raise exception 'Lista de pendências inválida';end if;
 if m.id is not null then
  before_snapshot:=jsonb_build_object('report',to_jsonb(m),'items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.daily_report_items x where x.daily_report_id=ident));
 end if;
 select coalesce(nullif(trim(raw_user_meta_data->>'full_name'),''),email::text),email::text into actor_name,actor_email from auth.users where id=u;
 if m.id is null then
  insert into public.daily_reports(id,work_id,created_by,date,weather,responsible_user,workers_quantity,equipment,equipment_quantity,observations,budget_id,author_email)
  values(ident,wid,u,report_date,p_payload->'report'->>'weather',coalesce(nullif(trim(p_payload->'report'->>'responsible_user'),''),actor_name),
   (p_payload->'report'->>'workers_quantity')::integer,array(select jsonb_array_elements_text(coalesce(p_payload->'report'->'equipment','[]'))),
   (p_payload->'report'->>'equipment_quantity')::integer,coalesce(p_payload->'report'->>'observations',''),bid,actor_email);
 else
  update public.daily_reports set date=report_date,weather=p_payload->'report'->>'weather',
   responsible_user=coalesce(nullif(trim(p_payload->'report'->>'responsible_user'),''),m.responsible_user),
   workers_quantity=(p_payload->'report'->>'workers_quantity')::integer,
   equipment=array(select jsonb_array_elements_text(coalesce(p_payload->'report'->'equipment','[]'))),
   equipment_quantity=(p_payload->'report'->>'equipment_quantity')::integer,observations=coalesce(p_payload->'report'->>'observations',''),budget_id=bid
   where id=ident;
 end if;
 delete from public.daily_report_items where daily_report_id=ident;
 for it in select value from jsonb_array_elements(p_payload->'items') loop
  qty:=(it->>'executed_quantity')::numeric;
  if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 or qty>1000000000000 or qty<>round(qty,4) then raise exception 'Quantidade precisa ser positiva, com até quatro casas decimais';end if;
  if num_nonnulls(nullif(it->>'service_id',''),nullif(it->>'budget_item_id',''))<>1 then raise exception 'Informe somente uma referência de serviço';end if;
  if nullif(it->>'budget_item_id','') is not null then
   if bid is null or not exists(select 1 from public.budget_items b where b.id=(it->>'budget_item_id')::uuid and b.budget_id=bid and b.work_id=wid) then raise exception 'Serviço não pertence ao orçamento selecionado';end if;
  end if;
  insert into public.daily_report_items(work_id,daily_report_id,service_id,budget_item_id,budget_id,executed_quantity,description)
  values(wid,ident,nullif(it->>'service_id','')::uuid,nullif(it->>'budget_item_id','')::uuid,
   case when nullif(it->>'budget_item_id','') is null then null else bid end,qty,coalesce(it->>'description',''));
 end loop;
 -- Existing issues and photos remain; the editor only appends new entries.
 for it in select value from jsonb_array_elements(p_payload->'issues') loop
  if jsonb_typeof(it)<>'string' or length(trim(it#>>'{}')) not between 1 and 2000 then raise exception 'Descrição de pendência inválida';end if;
  insert into public.issues(work_id,daily_report_id,description) values(wid,ident,trim(it#>>'{}'));
 end loop;
 update public.photos set budget_id=bid where daily_report_id=ident and budget_id is null and bid is not null;
 for it in select value from jsonb_array_elements(p_payload->'photos') loop
  path:=it->>'storage_path';
  if path is null or split_part(path,'/',1)<>wid::text or split_part(path,'/',2)<>ident::text or not exists(select 1 from storage.objects o where o.bucket_id='diary-photos' and o.name=path) then raise exception 'Foto não disponível para este diário';end if;
  if exists(select 1 from public.photos p where p.storage_path=path and p.daily_report_id<>ident) then raise exception 'Foto já vinculada a outro diário';end if;
  insert into public.photos(work_id,daily_report_id,storage_path,description,budget_id) values(wid,ident,path,coalesce(it->>'description',''),bid) on conflict(storage_path) do nothing;
 end loop;
 if desired='finalizado' then
  if not exists(select 1 from public.daily_report_items where daily_report_id=ident)
    and trim(coalesce(p_payload->'report'->>'observations',''))=''
    and not exists(select 1 from public.photos where daily_report_id=ident)
    and not exists(select 1 from public.issues where daily_report_id=ident)
  then raise exception 'Registre serviço, ocorrência, observação ou foto antes de finalizar';end if;
  update public.daily_reports set status='finalizado' where id=ident;
 end if;
 select revision into rev from public.daily_reports where id=ident;
 after_snapshot:=jsonb_build_object('report',(select to_jsonb(r) from public.daily_reports r where r.id=ident),
  'items',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.daily_report_items x where x.daily_report_id=ident));
 insert into public.diary_changes(report_id,work_id,request_id,actor_id,result_revision,before_data,after_data) values(ident,wid,req,u,rev,before_snapshot,after_snapshot);
 return jsonb_build_object('id',ident,'revision',rev,'request_id',req);
end $$;
revoke all on function private.save_diary_entry(jsonb) from public,anon;
grant execute on function private.save_diary_entry(jsonb) to authenticated;
create function public.save_diary_entry(p_payload jsonb) returns jsonb language sql security invoker set search_path='' as $$select private.save_diary_entry(p_payload)$$;
revoke all on function public.save_diary_entry(jsonb) from public,anon;
grant execute on function public.save_diary_entry(jsonb) to authenticated;
