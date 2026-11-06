create or replace function private.allowed_work(p_user uuid,p_work uuid,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
select p_user is not null and exists(select 1 from public.app_profiles p join public.works w on w.id=p_work where p.user_id=p_user and p.active and
(p.role<>'engenheiro' or exists(select 1 from public.work_members m where m.work_id=w.id and m.user_id=p_user and (not p_write or m.role='editor'))))
$$;
revoke update on public.works from authenticated;
grant update(name,location,status,start_date,end_date,planned_progress,actual_progress) on public.works to authenticated;
revoke update on public.work_fronts from authenticated;
grant update(name,active) on public.work_fronts to authenticated;
create function public.telegram_allowed_works(p_telegram bigint,p_write boolean default true) returns table(id uuid,name text) language sql stable security invoker set search_path='' as $$
select w.id,w.name from public.works w join public.telegram_accounts a on a.telegram_user_id=p_telegram where w.status<>'concluida' and private.allowed_work(a.user_id,w.id,p_write) order by w.name
$$;
revoke all on function public.telegram_allowed_works(bigint,boolean) from public,anon,authenticated;
grant execute on function public.telegram_allowed_works(bigint,boolean) to service_role;
CREATE OR REPLACE FUNCTION public.telegram_conversation_choose(p_telegram bigint, p_user uuid, p_stage text, p_options jsonb, p_work uuid, p_front uuid, p_update bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 if not exists(select 1 from public.telegram_accounts where telegram_user_id=p_telegram and user_id=p_user) then raise exception 'Conta não vinculada';end if;
 if p_stage in ('choose_front','observation') and not exists(select 1 from public.works w where w.id=p_work and w.status<>'concluida' and private.allowed_work(p_user,w.id,true)) then raise exception 'Obra indisponível';end if;
 if p_stage='observation' and not exists(select 1 from public.work_fronts where id=p_front and work_id=p_work and active) then raise exception 'Frente indisponível';end if;
 insert into public.telegram_conversations(telegram_user_id,user_id,stage,options,work_id,front_id,last_update,selection_update,expires_at)
 values(p_telegram,p_user,p_stage,p_options,p_work,p_front,p_update,p_update,now()+interval '20 minutes')
 on conflict(telegram_user_id) do update set user_id=excluded.user_id,stage=excluded.stage,options=excluded.options,work_id=excluded.work_id,front_id=excluded.front_id,last_update=excluded.last_update,selection_update=excluded.selection_update,expires_at=excluded.expires_at,report_id=null
 where public.telegram_conversations.last_update<excluded.last_update;
 return found;
end $function$
;
CREATE OR REPLACE FUNCTION public.telegram_diary_append(p_update bigint, p_telegram bigint, p_text text, p_path text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.telegram_conversations%rowtype; u uuid; r uuid;
begin
 select * into c from public.telegram_conversations where telegram_user_id=p_telegram for update;
 select user_id into u from public.telegram_accounts where telegram_user_id=p_telegram;
 if c.user_id is distinct from u or u is null or c.stage<>'observation' or c.expires_at<now() then raise exception 'Inicie novamente com /diario';end if;
 if not exists(select 1 from public.works w where w.id=c.work_id and private.allowed_work(u,w.id,true)) then raise exception 'Sem acesso à obra';end if;
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
end $function$
;
CREATE OR REPLACE FUNCTION public.telegram_draft(p_update bigint, p_telegram_id bigint, p_work uuid, p_observation text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_user uuid; v_report uuid; v_name text;
begin
 select user_id into v_user from public.telegram_accounts where telegram_user_id=p_telegram_id;
 if v_user is null then raise exception 'Conta não vinculada'; end if;
 if not exists(select 1 from public.works w where w.id=p_work and
  private.allowed_work(v_user,w.id,true))
 then raise exception 'Obra indisponível para registro'; end if;
 insert into public.telegram_updates(update_id) values(p_update) on conflict do nothing;
 if not found then
  select report_id into v_report from public.telegram_updates where update_id=p_update;
  return v_report;
 end if;
 v_name := 'Telegram — revisar responsável';
 insert into public.daily_reports(work_id,created_by,date,weather,responsible_user,workers_quantity,equipment,equipment_quantity,observations,status,source)
 values(p_work,v_user,(now() at time zone 'America/Sao_Paulo')::date,'Ensolarado',v_name,0,'{}',0,p_observation,'rascunho','telegram')
 returning id into v_report;
 update public.telegram_updates set report_id=v_report where update_id=p_update;
 return v_report;
end $function$
;
CREATE OR REPLACE FUNCTION public.telegram_fronts(p_telegram bigint, p_work uuid)
 RETURNS SETOF work_fronts
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare u uuid;
begin
 select user_id into u from public.telegram_accounts where telegram_user_id=p_telegram;
 if u is null or not exists(select 1 from public.works w where w.id=p_work and w.status<>'concluida' and private.allowed_work(u,w.id,true)) then raise exception 'Obra indisponível';end if;
 if not exists(select 1 from public.work_fronts where work_id=p_work) then
 insert into public.work_fronts(work_id,name) select p_work,n from unnest(array['Água','Esgoto','Galeria','Terraplenagem']) n on conflict(work_id,name) do nothing;
 end if;
 return query select * from public.work_fronts where work_id=p_work and active order by name;
end $function$
;

