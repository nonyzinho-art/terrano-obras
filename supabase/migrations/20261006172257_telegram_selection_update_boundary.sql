alter table public.telegram_conversations add column selection_update bigint not null default 0;
create or replace function public.telegram_conversation_choose(p_telegram bigint,p_user uuid,p_stage text,p_options jsonb,p_work uuid,p_front uuid,p_update bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.telegram_accounts where telegram_user_id=p_telegram and user_id=p_user) then raise exception 'Conta não vinculada';end if;
 if p_stage in ('choose_front','observation') and not exists(select 1 from public.works w where w.id=p_work and w.status<>'concluida' and (w.owner_id=p_user or exists(select 1 from public.work_members m where m.work_id=w.id and m.user_id=p_user and m.role='editor'))) then raise exception 'Obra indisponível';end if;
 if p_stage='observation' and not exists(select 1 from public.work_fronts where id=p_front and work_id=p_work and active) then raise exception 'Frente indisponível';end if;
 insert into public.telegram_conversations(telegram_user_id,user_id,stage,options,work_id,front_id,last_update,selection_update,expires_at)
 values(p_telegram,p_user,p_stage,p_options,p_work,p_front,p_update,p_update,now()+interval '20 minutes')
 on conflict(telegram_user_id) do update set user_id=excluded.user_id,stage=excluded.stage,options=excluded.options,work_id=excluded.work_id,front_id=excluded.front_id,last_update=excluded.last_update,selection_update=excluded.selection_update,expires_at=excluded.expires_at,report_id=null
 where public.telegram_conversations.last_update<excluded.last_update;
 return found;
end $$;
create or replace function public.telegram_diary_append_v2(p_update bigint,p_telegram bigint,p_text text,p_path text,p_work uuid,p_front uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.telegram_conversations%rowtype; r uuid;
begin
 select * into c from public.telegram_conversations where telegram_user_id=p_telegram for update;
 if p_update<=c.selection_update then raise exception 'Envio anterior à seleção atual';end if;
 if c.work_id is distinct from p_work or c.front_id is distinct from p_front or p_front is null then raise exception 'Seleção mudou. Inicie novamente';end if;
 if not exists(select 1 from public.work_fronts f join public.works w on w.id=f.work_id where f.id=p_front and f.work_id=p_work and f.active and w.status<>'concluida') then raise exception 'Frente indisponível';end if;
 if c.report_id is not null and not exists(select 1 from public.daily_reports where id=c.report_id and front_id=p_front and date=(now() at time zone 'America/Sao_Paulo')::date) then raise exception 'Inicie um novo diário para hoje';end if;
 r:=public.telegram_diary_append(p_update,p_telegram,p_text,p_path);
 update public.daily_reports set front_id=p_front where id=r and work_id=p_work and (front_id is null or front_id=p_front);
 if not found then raise exception 'Frente do diário inválida';end if;
 return r;
end $$;

