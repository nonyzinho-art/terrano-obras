
create function public.save_daily_report(payload jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare report_id uuid := coalesce((payload->>'id')::uuid,gen_random_uuid());
work_id uuid := (payload->'report'->>'work_id')::uuid;
desired_status text := payload->'report'->>'status';
it jsonb;
begin
 if auth.uid() is null or not public.can_access_work(work_id,true) then raise exception 'Sem acesso a esta obra'; end if;
 if desired_status not in ('rascunho','finalizado') then raise exception 'Status inválido'; end if;
 -- Idempotent retry: never duplicate finalized quantities.
 if exists(select 1 from public.daily_reports r where r.id=report_id and r.created_by=auth.uid()) then
   return report_id;
 end if;
 if desired_status='finalizado' and jsonb_array_length(coalesce(payload->'items','[]'::jsonb))=0 then
  raise exception 'Informe ao menos um serviço executado';
 end if;
 insert into public.daily_reports(id,work_id,date,weather,responsible_user,workers_quantity,equipment,equipment_quantity,observations,status)
 values(report_id,work_id,(payload->'report'->>'date')::date,payload->'report'->>'weather',
 payload->'report'->>'responsible_user',coalesce((payload->'report'->>'workers_quantity')::integer,0),
 array(select jsonb_array_elements_text(coalesce(payload->'report'->'equipment','[]'::jsonb))),
 coalesce((payload->'report'->>'equipment_quantity')::integer,0),coalesce(payload->'report'->>'observations',''),'rascunho');
 for it in select * from jsonb_array_elements(coalesce(payload->'items','[]'::jsonb)) loop
  insert into public.daily_report_items(work_id,daily_report_id,service_id,executed_quantity,description)
  values(work_id,report_id,(it->>'service_id')::uuid,(it->>'executed_quantity')::numeric,coalesce(it->>'description',''));
 end loop;
 for it in select * from jsonb_array_elements(coalesce(payload->'issues','[]'::jsonb)) loop
  insert into public.issues(work_id,daily_report_id,description) values(work_id,report_id,it#>>'{}');
 end loop;
 for it in select * from jsonb_array_elements(coalesce(payload->'photos','[]'::jsonb)) loop
  insert into public.photos(work_id,daily_report_id,storage_path,description)
  values(work_id,report_id,it->>'storage_path',coalesce(it->>'description',''));
 end loop;
 if desired_status='finalizado' then
  update public.daily_reports set status='finalizado' where id=report_id;
 end if;
 return report_id;
end $$;
revoke all on function public.save_daily_report(jsonb) from public,anon;
grant execute on function public.save_daily_report(jsonb) to authenticated;
-- Uploads can precede the report insert; names are work_uuid/report_uuid/file.
drop policy diary_photo_upload on storage.objects;
create policy diary_photo_upload on storage.objects for insert to authenticated
 with check(bucket_id='diary-photos' and exists(select 1 from public.works w
 where w.id::text=(storage.foldername(name))[1] and public.can_access_work(w.id,true)));
create policy diary_photo_cleanup on storage.objects for delete to authenticated
 using(bucket_id='diary-photos' and owner_id=(select auth.uid())::text
 and not exists(select 1 from public.photos p where p.storage_path=name));

