create function private.telegram_author_identity(p_telegram bigint)
returns table(display_name text,email text)
language sql stable security definer set search_path='' as $$
 select coalesce(nullif(left(trim(u.raw_user_meta_data->>'full_name'),120),''),u.email),u.email
 from public.telegram_accounts a join auth.users u on u.id=a.user_id
 join public.app_profiles p on p.user_id=a.user_id and p.active
 where a.telegram_user_id=p_telegram
$$;
revoke all on function private.telegram_author_identity(bigint) from public,anon,authenticated;
grant execute on function private.telegram_author_identity(bigint) to service_role;
CREATE OR REPLACE FUNCTION public.telegram_draft(p_update bigint, p_telegram_id bigint, p_work uuid, p_observation text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_user uuid; v_report uuid; v_name text; v_email text;
begin
 select user_id into v_user from public.telegram_accounts where telegram_user_id=p_telegram_id;
 if v_user is null then raise exception 'Conta não vinculada';end if;
 if not exists(select 1 from public.works w where w.id=p_work and private.allowed_work(v_user,w.id,true)) then raise exception 'Obra indisponível para registro';end if;
 insert into public.telegram_updates(update_id) values(p_update) on conflict do nothing;
 if not found then select report_id into v_report from public.telegram_updates where update_id=p_update;return v_report;end if;
 select display_name,email into v_name,v_email from private.telegram_author_identity(p_telegram_id);
 if nullif(trim(v_name),'') is null then raise exception 'Conta vinculada sem identificação';end if;
 insert into public.daily_reports(work_id,created_by,date,weather,responsible_user,workers_quantity,equipment,equipment_quantity,observations,status,source,author_email)
 values(p_work,v_user,(now() at time zone 'America/Sao_Paulo')::date,'Ensolarado',v_name,0,'{}',0,p_observation,'rascunho','telegram',v_email) returning id into v_report;
 update public.telegram_updates set report_id=v_report where update_id=p_update;
 return v_report;
end $function$

;
