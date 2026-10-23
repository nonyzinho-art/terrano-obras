alter table public.daily_reports add column author_email text;
CREATE OR REPLACE FUNCTION public.telegram_draft(p_update bigint, p_telegram_id bigint, p_work uuid, p_observation text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $function$
declare v_user uuid; v_report uuid; v_name text; v_email text;
begin
 select user_id into v_user from public.telegram_accounts where telegram_user_id=p_telegram_id;
 if v_user is null then raise exception 'Conta não vinculada';end if;
 if not exists(select 1 from public.works w where w.id=p_work and private.allowed_work(v_user,w.id,true)) then raise exception 'Obra indisponível para registro';end if;
 insert into public.telegram_updates(update_id) values(p_update) on conflict do nothing;
 if not found then select report_id into v_report from public.telegram_updates where update_id=p_update;return v_report;end if;
 select coalesce(nullif(left(trim(raw_user_meta_data->>'full_name'),120),''),email),email into v_name,v_email from auth.users where id=v_user;
 if nullif(trim(v_name),'') is null then raise exception 'Conta vinculada sem identificação';end if;
 insert into public.daily_reports(work_id,created_by,date,weather,responsible_user,workers_quantity,equipment,equipment_quantity,observations,status,source,author_email)
 values(p_work,v_user,(now() at time zone 'America/Sao_Paulo')::date,'Ensolarado',v_name,0,'{}',0,p_observation,'rascunho','telegram',v_email) returning id into v_report;
 update public.telegram_updates set report_id=v_report where update_id=p_update;
 return v_report;
end $function$;
revoke all on function public.telegram_draft(bigint,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.telegram_draft(bigint,bigint,uuid,text) to service_role;

update public.daily_reports r set author_email=u.email,
 responsible_user=case when r.responsible_user in (u.email,'Telegram — revisar responsável')
 then coalesce(nullif(left(trim(u.raw_user_meta_data->>'full_name'),120),''),u.email) else r.responsible_user end
from auth.users u where r.created_by=u.id and r.source='telegram';
create function private.sync_telegram_author_name() returns trigger language plpgsql security definer set search_path='' as $$
declare old_label text; new_label text;
begin
 old_label:=coalesce(nullif(left(trim(old.raw_user_meta_data->>'full_name'),120),''),old.email);
 new_label:=coalesce(nullif(left(trim(new.raw_user_meta_data->>'full_name'),120),''),new.email);
 if new_label is distinct from old_label then
  update public.daily_reports set responsible_user=new_label
  where created_by=new.id and source='telegram'
  and responsible_user in (old_label,old.email,'Telegram — revisar responsável');
 end if;
 return new;
end $$;
revoke all on function private.sync_telegram_author_name() from public,anon,authenticated;
create trigger telegram_author_name_updated after update of raw_user_meta_data on auth.users for each row
when (old.raw_user_meta_data is distinct from new.raw_user_meta_data) execute function private.sync_telegram_author_name();
