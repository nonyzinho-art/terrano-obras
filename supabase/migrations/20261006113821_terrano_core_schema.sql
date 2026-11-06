
create table public.works (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null default auth.uid() references auth.users(id),
 name text not null check (length(trim(name)) > 0),
 location text not null default 'Goiás',
 status text not null default 'em_andamento' check (status in ('em_andamento','atencao','atrasada','concluida')),
 start_date date, end_date date,
 planned_progress numeric(5,2) not null default 0 check (planned_progress between 0 and 100),
 actual_progress numeric(5,2) not null default 0 check (actual_progress between 0 and 100),
 created_at timestamptz not null default now(),
 check (end_date is null or start_date is null or end_date >= start_date)
);
create index works_owner_idx on public.works(owner_id);

-- Memberships are provisioned by an administrator on the server.
-- Browser users cannot grant themselves permissions.
create table public.work_members (
 work_id uuid not null references public.works(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('viewer','editor')),
 primary key(work_id,user_id)
);
create index work_members_user_idx on public.work_members(user_id,work_id);
alter table public.works enable row level security;
alter table public.work_members enable row level security;
create policy membership_self_read on public.work_members for select to authenticated using(user_id=(select auth.uid()));
create policy work_read on public.works for select to authenticated using(
 owner_id=(select auth.uid()) or exists(select 1 from public.work_members m where m.work_id=id and m.user_id=(select auth.uid()))
);
create policy work_create on public.works for insert to authenticated with check(owner_id=(select auth.uid()));
create policy work_update on public.works for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));

create function public.can_access_work(target_work uuid, needs_write boolean default false)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.works w where w.id=target_work and (
 w.owner_id=(select auth.uid()) or exists(select 1 from public.work_members m
 where m.work_id=w.id and m.user_id=(select auth.uid()) and (not needs_write or m.role='editor'))))
$$;
revoke all on function public.can_access_work(uuid,boolean) from public,anon;
grant execute on function public.can_access_work(uuid,boolean) to authenticated,service_role;

create table public.budgets (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 name text not null check(length(trim(name))>0),
 status text not null default 'em_cotacao' check(status in ('em_cotacao','cotado','aprovado')),
 updated_at timestamptz not null default now(),
 unique(work_id,id)
);
create index budgets_work_idx on public.budgets(work_id);
create table public.budget_items (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null, budget_id uuid not null,
 code text not null, "group" text not null default '',
 description text not null, unit text not null,
 planned_quantity numeric(18,4) not null check(planned_quantity >= 0),
 unit_price numeric(18,4) not null check(unit_price >= 0),
 total_price numeric(24,4) generated always as (planned_quantity*unit_price) stored,
 status text not null default 'em_cotacao' check(status in ('em_cotacao','cotado','aprovado')),
 foreign key(work_id,budget_id) references public.budgets(work_id,id) on delete cascade
);
create index budget_items_parent_idx on public.budget_items(work_id,budget_id);
create index budget_items_budget_idx on public.budget_items(budget_id);

create table public.work_services (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 name text not null, unit text not null,
 planned_start date, planned_end date,
 planned_quantity numeric(18,4) not null check(planned_quantity>0),
 unique(work_id,id),
 check(planned_end is null or planned_start is null or planned_end>=planned_start)
);
create index work_services_work_idx on public.work_services(work_id);
create table public.daily_reports (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 created_by uuid not null default auth.uid() references auth.users(id),
 date date not null,
 weather text not null check(weather in ('Ensolarado','Nublado','Chuvoso','Parcialmente nublado')),
 responsible_user text not null,
 workers_quantity integer not null default 0 check(workers_quantity>=0),
 equipment text[] not null default '{}',
 equipment_quantity integer not null default 0 check(equipment_quantity>=0),
 observations text not null default '',
 status text not null default 'rascunho' check(status in ('rascunho','finalizado')),
 source text not null default 'web' check(source in ('web','telegram')),
 created_at timestamptz not null default now(),
 unique(work_id,id)
);
create index daily_reports_calendar_idx on public.daily_reports(work_id,date desc);
create index daily_reports_author_idx on public.daily_reports(created_by);
create table public.daily_report_items (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null,
 daily_report_id uuid not null,
 service_id uuid not null,
 executed_quantity numeric(18,4) not null check(executed_quantity>0),
 description text not null default '',
 foreign key(work_id,daily_report_id) references public.daily_reports(work_id,id) on delete cascade,
 foreign key(work_id,service_id) references public.work_services(work_id,id)
);
create index daily_report_items_report_idx on public.daily_report_items(daily_report_id);
create index daily_report_items_service_idx on public.daily_report_items(service_id);
create index daily_report_items_work_report_idx on public.daily_report_items(work_id,daily_report_id);
create index daily_report_items_work_service_idx on public.daily_report_items(work_id,service_id);
create table public.photos (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null,
 daily_report_id uuid not null,
 storage_path text not null unique,
 description text not null default '',
 created_at timestamptz not null default now(),
 foreign key(work_id,daily_report_id) references public.daily_reports(work_id,id) on delete cascade,
 check(split_part(storage_path,'/',1)=work_id::text)
);
create index photos_report_idx on public.photos(daily_report_id);
create index photos_work_report_idx on public.photos(work_id,daily_report_id);
create table public.issues (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 daily_report_id uuid,
 description text not null,
 status text not null default 'aberta' check(status in ('aberta','concluida')),
 created_at timestamptz not null default now(),
 foreign key(work_id,daily_report_id) references public.daily_reports(work_id,id)
);
create index issues_work_status_idx on public.issues(work_id,status);
create index issues_report_idx on public.issues(daily_report_id);
create index issues_work_report_idx on public.issues(work_id,daily_report_id);

-- Finalized measurements are derived, rather than incremented twice on retries.
create view public.service_execution with (security_invoker=true) as
select s.*, coalesce((
 select sum(i.executed_quantity) from public.daily_report_items i
 join public.daily_reports r on r.id=i.daily_report_id
 where i.service_id=s.id and r.status='finalizado'
),0) as executed_quantity
from public.work_services s;
grant select on public.service_execution to authenticated;

-- Data access is scoped to explicit work ownership/membership.
do $$
declare t text;
begin
 foreach t in array array['budgets','budget_items','work_services','daily_reports','daily_report_items','photos','issues']
 loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy work_scoped_read on public.%I for select to authenticated using(public.can_access_work(work_id,false))',t);
 if t in ('budgets','budget_items','work_services','issues') then
 execute format('create policy work_scoped_insert on public.%I for insert to authenticated with check(public.can_access_work(work_id,true))',t);
 execute format('create policy work_scoped_update on public.%I for update to authenticated using(public.can_access_work(work_id,true)) with check(public.can_access_work(work_id,true))',t);
 end if;
 end loop;
end $$;
create policy report_insert on public.daily_reports for insert to authenticated
 with check(created_by=(select auth.uid()) and status='rascunho' and public.can_access_work(work_id,true));
create policy report_update on public.daily_reports for update to authenticated
 using(created_by=(select auth.uid()) and status='rascunho' and public.can_access_work(work_id,true))
 with check(created_by=(select auth.uid()) and public.can_access_work(work_id,true));
create function public.can_edit_report(target_report uuid,target_work uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.daily_reports r where r.id=target_report and r.work_id=target_work
 and r.created_by=(select auth.uid()) and r.status='rascunho' and public.can_access_work(r.work_id,true))
$$;
revoke all on function public.can_edit_report(uuid,uuid) from public,anon;
grant execute on function public.can_edit_report(uuid,uuid) to authenticated,service_role;
do $$
declare t text;
begin
 foreach t in array array['daily_report_items','photos'] loop
 execute format('create policy draft_insert on public.%I for insert to authenticated with check(public.can_edit_report(daily_report_id,work_id))',t);
 execute format('create policy draft_update on public.%I for update to authenticated using(public.can_edit_report(daily_report_id,work_id)) with check(public.can_edit_report(daily_report_id,work_id))',t);
 execute format('create policy draft_delete on public.%I for delete to authenticated using(public.can_edit_report(daily_report_id,work_id))',t);
 end loop;
end $$;
revoke all on public.works,public.work_members,public.budgets,public.budget_items,public.work_services,public.daily_reports,public.daily_report_items,public.photos,public.issues from anon;
grant select,insert,update on public.works,public.budgets,public.budget_items,public.work_services,public.daily_reports,public.issues to authenticated;
grant select on public.work_members to authenticated;
grant select,insert,update,delete on public.daily_report_items,public.photos to authenticated;

-- Private photo bucket. Object paths: work_uuid/report_uuid/file_name.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('diary-photos','diary-photos',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy diary_photo_read on storage.objects for select to authenticated
 using(bucket_id='diary-photos' and exists(select 1 from public.works w where w.id::text=(storage.foldername(name))[1]));
create policy diary_photo_upload on storage.objects for insert to authenticated
 with check(bucket_id='diary-photos' and exists(select 1 from public.daily_reports r
 where r.work_id::text=(storage.foldername(name))[1] and r.id::text=(storage.foldername(name))[2]
 and public.can_edit_report(r.id,r.work_id)));

-- Bot identity and idempotency are server-only; no frontend grants.
create table public.telegram_accounts (
 telegram_user_id bigint primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 linked_at timestamptz not null default now()
);
create index telegram_accounts_user_idx on public.telegram_accounts(user_id);
create table public.telegram_updates (
 update_id bigint primary key,
 processed_at timestamptz not null default now()
);
alter table public.telegram_accounts enable row level security;
alter table public.telegram_updates enable row level security;
revoke all on public.telegram_accounts,public.telegram_updates from anon,authenticated;
create policy server_only on public.telegram_accounts to service_role using(true) with check(true);
create policy server_only on public.telegram_updates to service_role using(true) with check(true);

