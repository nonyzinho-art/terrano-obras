
create table public.telegram_link_codes (
 token_hash text primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 expires_at timestamptz not null
);
create index telegram_link_codes_user_idx on public.telegram_link_codes(user_id);
alter table public.telegram_link_codes enable row level security;
revoke all on public.telegram_link_codes from anon, authenticated;
grant all on public.telegram_link_codes to service_role;
create policy server_only on public.telegram_link_codes to service_role using(true) with check(true);

create function public.consume_telegram_link(p_hash text,p_telegram_id bigint) returns boolean
language plpgsql security invoker set search_path='' as $$
declare v_user uuid;
begin
 delete from public.telegram_link_codes where token_hash=p_hash and expires_at>now() returning user_id into v_user;
 if v_user is null then return false; end if;
 insert into public.telegram_accounts(telegram_user_id,user_id) values(p_telegram_id,v_user)
 on conflict(telegram_user_id) do update set user_id=excluded.user_id,linked_at=now();
 return true;
end $$;
revoke all on function public.consume_telegram_link(text,bigint) from public,anon,authenticated;
grant execute on function public.consume_telegram_link(text,bigint) to service_role;

alter table public.telegram_updates add column report_id uuid references public.daily_reports(id);
create index telegram_updates_report_idx on public.telegram_updates(report_id);
create function public.telegram_draft(p_update bigint,p_telegram_id bigint,p_work uuid,p_observation text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_user uuid; v_report uuid; v_name text;
begin
 select user_id into v_user from public.telegram_accounts where telegram_user_id=p_telegram_id;
 if v_user is null then raise exception 'Conta não vinculada'; end if;
 if not exists(select 1 from public.works w where w.id=p_work and
  (w.owner_id=v_user or exists(select 1 from public.work_members m where m.work_id=w.id and m.user_id=v_user and m.role='editor')))
 then raise exception 'Obra indisponível para registro'; end if;
 insert into public.telegram_updates(update_id) values(p_update) on conflict do nothing;
 if not found then
  select report_id into v_report from public.telegram_updates where update_id=p_update;
  return v_report;
 end if;
 select email into v_name from auth.users where id=v_user;
 insert into public.daily_reports(work_id,created_by,date,weather,responsible_user,workers_quantity,equipment,equipment_quantity,observations,status,source)
 values(p_work,v_user,(now() at time zone 'America/Sao_Paulo')::date,'Ensolarado',v_name,0,'{}',0,p_observation,'rascunho','telegram')
 returning id into v_report;
 update public.telegram_updates set report_id=v_report where update_id=p_update;
 return v_report;
end $$;
revoke all on function public.telegram_draft(bigint,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.telegram_draft(bigint,bigint,uuid,text) to service_role;

