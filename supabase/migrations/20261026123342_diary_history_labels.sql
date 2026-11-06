create function private.diary_history(p_report uuid)
returns table(id uuid,recorded_at timestamptz,actor_name text,revision integer,status text)
language plpgsql security definer set search_path='' as $$
declare wid uuid;
begin
 if auth.uid() is null then raise exception 'Entre na sua conta';end if;
 select r.work_id into wid from public.daily_reports r where r.id=p_report;
 if wid is null or not private.allowed_work(auth.uid(),wid,false) then raise exception 'Sem acesso a este diário';end if;
 return query select c.id,c.recorded_at,coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),u.email::text,'Conta removida'),c.result_revision,c.after_data->'report'->>'status'
 from public.diary_changes c left join auth.users u on u.id=c.actor_id where c.report_id=p_report order by c.recorded_at desc,c.result_revision desc;
end $$;
revoke all on function private.diary_history(uuid) from public,anon;
grant execute on function private.diary_history(uuid) to authenticated;
create function public.diary_history(p_report uuid)
returns table(id uuid,recorded_at timestamptz,actor_name text,revision integer,status text)
language sql security invoker set search_path='' as $$select * from private.diary_history(p_report)$$;
revoke all on function public.diary_history(uuid) from public,anon;
grant execute on function public.diary_history(uuid) to authenticated;
