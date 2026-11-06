
alter table public.telegram_conversations add column report_id uuid references public.daily_reports(id);
create index telegram_conversations_report_idx on public.telegram_conversations(report_id);
create or replace function public.telegram_conversation_put(p_telegram bigint,p_user uuid,p_stage text,p_options jsonb,p_work uuid,p_update bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.telegram_accounts where telegram_user_id=p_telegram and user_id=p_user) then raise exception 'Conta não vinculada'; end if;
 insert into public.telegram_conversations(telegram_user_id,user_id,stage,options,work_id,last_update,expires_at)
 values(p_telegram,p_user,p_stage,p_options,p_work,p_update,now()+interval '20 minutes')
 on conflict(telegram_user_id) do update set user_id=excluded.user_id,stage=excluded.stage,options=excluded.options,work_id=excluded.work_id,last_update=excluded.last_update,expires_at=excluded.expires_at,report_id=null
 where public.telegram_conversations.last_update<excluded.last_update;
 return found;
end $$;
create function public.telegram_diary_append(p_update bigint,p_telegram bigint,p_text text,p_path text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.telegram_conversations%rowtype; u uuid; r uuid;
begin
 select * into c from public.telegram_conversations where telegram_user_id=p_telegram for update;
 select user_id into u from public.telegram_accounts where telegram_user_id=p_telegram;
 if c.user_id is distinct from u or u is null or c.stage<>'observation' or c.expires_at<now() then raise exception 'Inicie novamente com /diario';end if;
 if not exists(select 1 from public.works w where w.id=c.work_id and (w.owner_id=u or exists(select 1 from public.work_members m where m.work_id=w.id and m.user_id=u and m.role='editor'))) then raise exception 'Sem acesso à obra';end if;
 if p_path is not null and p_path<>c.work_id::text||'/telegram/'||p_update::text||'.jpg' then raise exception 'Caminho inválido';end if;
 if length(coalesce(p_text,''))>5000 then raise exception 'Texto muito longo';end if;
 select report_id into r from public.telegram_updates where update_id=p_update;
 if found then return r;end if;
 if c.report_id is null then
  r=public.telegram_draft(p_update,p_telegram,c.work_id,coalesce(p_text,''));
 else
  r=c.report_id;
  if not exists(select 1 from public.daily_reports where id=r and created_by=u and work_id=c.work_id and status='rascunho') then raise exception 'Diário indisponível';end if;
  insert into public.telegram_updates(update_id,report_id) values(p_update,r);
  if coalesce(p_text,'')<>'' then update public.daily_reports set observations=concat_ws(E'\n',nullif(observations,''),p_text) where id=r;end if;
 end if;
 if p_path is not null then insert into public.photos(work_id,daily_report_id,storage_path,description) values(c.work_id,r,p_path,coalesce(p_text,''));end if;
 update public.telegram_conversations set report_id=r,last_update=greatest(last_update,p_update),expires_at=now()+interval '20 minutes' where telegram_user_id=p_telegram;
 return r;
end $$;
revoke all on function public.telegram_diary_append(bigint,bigint,text,text) from public,anon,authenticated;
grant execute on function public.telegram_diary_append(bigint,bigint,text,text) to service_role;

