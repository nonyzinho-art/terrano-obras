
create table public.telegram_conversations (
 telegram_user_id bigint primary key references public.telegram_accounts(telegram_user_id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 stage text not null check(stage in ('choose_work','observation','done')),
 options jsonb not null default '[]',
 work_id uuid references public.works(id) on delete cascade,
 last_update bigint not null,
 expires_at timestamptz not null default now()+interval '20 minutes'
);
create index telegram_conversations_user_idx on public.telegram_conversations(user_id);
create index telegram_conversations_work_idx on public.telegram_conversations(work_id);
alter table public.telegram_conversations enable row level security;
revoke all on public.telegram_conversations from anon,authenticated;
grant all on public.telegram_conversations to service_role;
create policy server_only on public.telegram_conversations to service_role using(true) with check(true);
create function public.telegram_conversation_put(p_telegram bigint,p_user uuid,p_stage text,p_options jsonb,p_work uuid,p_update bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.telegram_accounts where telegram_user_id=p_telegram and user_id=p_user) then raise exception 'Conta não vinculada'; end if;
 insert into public.telegram_conversations(telegram_user_id,user_id,stage,options,work_id,last_update,expires_at)
 values(p_telegram,p_user,p_stage,p_options,p_work,p_update,now()+interval '20 minutes')
 on conflict(telegram_user_id) do update set user_id=excluded.user_id,stage=excluded.stage,options=excluded.options,work_id=excluded.work_id,last_update=excluded.last_update,expires_at=excluded.expires_at
 where public.telegram_conversations.last_update<excluded.last_update;
 return found;
end $$;
create function public.telegram_conversation_save(p_update bigint,p_telegram bigint,p_observation text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.telegram_conversations%rowtype; r uuid;
begin
 select * into c from public.telegram_conversations where telegram_user_id=p_telegram for update;
 if c.telegram_user_id is null then raise exception 'Inicie com /diario';end if;
 if exists(select 1 from public.telegram_updates where update_id=p_update) then
  select report_id into r from public.telegram_updates where update_id=p_update;return r;
 end if;
 if c.stage<>'observation' or c.expires_at<now() or c.last_update>=p_update
 or not exists(select 1 from public.telegram_accounts where telegram_user_id=p_telegram and user_id=c.user_id)
 then raise exception 'Inicie novamente com /diario';end if;
 r=public.telegram_draft(p_update,p_telegram,c.work_id,p_observation);
 update public.telegram_conversations set stage='done',last_update=p_update where telegram_user_id=p_telegram;
 return r;
end $$;
revoke all on function public.telegram_conversation_put(bigint,uuid,text,jsonb,uuid,bigint),public.telegram_conversation_save(bigint,bigint,text) from public,anon,authenticated;
grant execute on function public.telegram_conversation_put(bigint,uuid,text,jsonb,uuid,bigint),public.telegram_conversation_save(bigint,bigint,text) to service_role;

