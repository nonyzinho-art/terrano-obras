alter policy documents_storage_read on storage.objects using(
 bucket_id='work-documents' and (
 exists(select 1 from public.work_documents d where d.storage_path=storage.objects.name and public.can_access_work(d.work_id,false))
 or ((storage.foldername(storage.objects.name))[2]=auth.uid()::text and exists(select 1 from public.works w where w.id::text=(storage.foldername(storage.objects.name))[1] and public.can_access_work(w.id,true)))
 ));

