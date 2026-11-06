create function private.measurement_report_authors(p_measurement uuid)
returns table(author_name text,author_email text,approver_name text,approver_email text)
language plpgsql stable security definer set search_path='' as $$
declare m public.budget_measurements%rowtype;
begin
 select * into m from public.budget_measurements where id=p_measurement;
 if auth.uid() is null or not found or not private.allowed_work(auth.uid(),m.work_id,false) then raise exception 'Medição não disponível para sua conta';end if;
 return query select coalesce(nullif(left(trim(a.raw_user_meta_data->>'full_name'),120),''),a.email),a.email::text,
 coalesce(nullif(left(trim(p.raw_user_meta_data->>'full_name'),120),''),p.email),p.email::text
 from auth.users a left join auth.users p on p.id=m.approved_by where a.id=m.created_by;
end $$;
revoke all on function private.measurement_report_authors(uuid) from public,anon,authenticated;
grant execute on function private.measurement_report_authors(uuid) to authenticated;
create function public.measurement_report_authors(p_measurement uuid)
returns table(author_name text,author_email text,approver_name text,approver_email text)
language sql security invoker set search_path='' as $$select * from private.measurement_report_authors(p_measurement)$$;
revoke all on function public.measurement_report_authors(uuid) from public,anon;
grant execute on function public.measurement_report_authors(uuid) to authenticated;
