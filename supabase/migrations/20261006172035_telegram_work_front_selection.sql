create table public.work_fronts (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 active boolean not null default true,
 unique(work_id,name), unique(id,work_id)
);
create index work_fronts_work_idx on public.work_fronts(work_id);
alter table public.work_fronts enable row level security;
revoke all on public.work_fronts from anon,authenticated;
grant select on public.work_fronts to authenticated;
grant all on public.work_fronts to service_role;
create policy fronts_read on public.work_fronts for select to authenticated using(public.can_access_work(work_id,false));
insert into public.work_fronts(work_id,name) select w.id,n from public.works w cross join unnest(array['Água','Esgoto','Galeria','Terraplenagem']) n;
alter table public.daily_reports add column front_id uuid;
alter table public.daily_reports add constraint report_front_work_fk foreign key(front_id,work_id) references public.work_fronts(id,work_id);
create index daily_reports_front_idx on public.daily_reports(front_id);
alter table public.telegram_conversations add column front_id uuid;
alter table public.telegram_conversations add constraint conversation_front_work_fk foreign key(front_id,work_id) references public.work_fronts(id,work_id);
alter table public.telegram_conversations drop constraint telegram_conversations_stage_check;
alter table public.telegram_conversations add constraint telegram_conversations_stage_check check(stage in ('choose_work','choose_front','observation','done'));
create index telegram_conversations_front_idx on public.telegram_conversations(front_id);
create function public.telegram_fronts(p_telegram bigint,p_work uuid) returns setof public.work_fronts
language plpgsql security invoker set search_path='' as $$
declare u uuid;
begin
 select user_id into u from public.telegram_accounts where telegram_user_id=p_telegram;
 if u is null or not exists(select 1 from public.works w where w.id=p_work and w.status<>'concluida' and (w.owner_id=u or exists(select 1 from public.work_members m where m.work_id=w.id and m.user_id=u and m.role='editor'))) then raise exception 'Obra indisponível';end if;
 if not exists(select 1 from public.work_fronts where work_id=p_work) then
 insert into public.work_fronts(work_id,name) select p_work,n from unnest(array['Água','Esgoto','Galeria','Terraplenagem']) n on conflict(work_id,name) do nothing;
 end if;
 return query select * from public.work_fronts where work_id=p_work and active order by name;
end $$;
create function public.telegram_conversation_choose(p_telegram bigint,p_user uuid,p_stage text,p_options jsonb,p_work uuid,p_front uuid,p_update bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.telegram_accounts where telegram_user_id=p_telegram and user_id=p_user) then raise exception 'Conta não vinculada';end if;
 if p_stage in ('choose_front','observation') and not exists(select 1 from public.works w where w.id=p_work and w.status<>'concluida' and (w.owner_id=p_user or exists(select 1 from public.work_members m where m.work_id=w.id and m.user_id=p_user and m.role='editor'))) then raise exception 'Obra indisponível';end if;
 if p_stage='observation' and not exists(select 1 from public.work_fronts where id=p_front and work_id=p_work and active) then raise exception 'Frente indisponível';end if;
 insert into public.telegram_conversations(telegram_user_id,user_id,stage,options,work_id,front_id,last_update,expires_at)
 values(p_telegram,p_user,p_stage,p_options,p_work,p_front,p_update,now()+interval '20 minutes')
 on conflict(telegram_user_id) do update set user_id=excluded.user_id,stage=excluded.stage,options=excluded.options,work_id=excluded.work_id,front_id=excluded.front_id,last_update=excluded.last_update,expires_at=excluded.expires_at,report_id=null
 where public.telegram_conversations.last_update<excluded.last_update;
 return found;
end $$;
create function public.telegram_diary_append_v2(p_update bigint,p_telegram bigint,p_text text,p_path text,p_work uuid,p_front uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.telegram_conversations%rowtype; r uuid;
begin
 select * into c from public.telegram_conversations where telegram_user_id=p_telegram for update;
 if c.work_id is distinct from p_work or c.front_id is distinct from p_front or p_front is null then raise exception 'Seleção mudou. Inicie novamente';end if;
 if not exists(select 1 from public.work_fronts f join public.works w on w.id=f.work_id where f.id=p_front and f.work_id=p_work and f.active and w.status<>'concluida') then raise exception 'Frente indisponível';end if;
 if c.report_id is not null and not exists(select 1 from public.daily_reports where id=c.report_id and front_id=p_front and date=(now() at time zone 'America/Sao_Paulo')::date) then raise exception 'Inicie um novo diário para hoje';end if;
 r:=public.telegram_diary_append(p_update,p_telegram,p_text,p_path);
 update public.daily_reports set front_id=p_front where id=r and work_id=p_work and (front_id is null or front_id=p_front);
 if not found then raise exception 'Frente do diário inválida';end if;
 return r;
end $$;
revoke all on function public.telegram_fronts(bigint,uuid),public.telegram_conversation_choose(bigint,uuid,text,jsonb,uuid,uuid,bigint),public.telegram_diary_append_v2(bigint,bigint,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.telegram_fronts(bigint,uuid),public.telegram_conversation_choose(bigint,uuid,text,jsonb,uuid,uuid,bigint),public.telegram_diary_append_v2(bigint,bigint,text,text,uuid,uuid) to service_role;

