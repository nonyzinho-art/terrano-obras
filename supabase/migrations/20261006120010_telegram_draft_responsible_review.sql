create or replace function public.telegram_draft(p_update bigint,p_telegram_id bigint,p_work uuid,p_observation text) returns uuid
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
 v_name := 'Telegram — revisar responsável';
 insert into public.daily_reports(work_id,created_by,date,weather,responsible_user,workers_quantity,equipment,equipment_quantity,observations,status,source)
 values(p_work,v_user,(now() at time zone 'America/Sao_Paulo')::date,'Ensolarado',v_name,0,'{}',0,p_observation,'rascunho','telegram')
 returning id into v_report;
 update public.telegram_updates set report_id=v_report where update_id=p_update;
 return v_report;
end $$;

