create schema if not exists private;
create table public.app_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'engenheiro' check(role in ('administrador','diretor','coordenador_comercial','coordenador_obras','engenheiro')),
 active boolean not null default false
);
alter table public.app_profiles enable row level security;
revoke all on public.app_profiles from anon,authenticated;
grant select on public.app_profiles to authenticated;
grant all on public.app_profiles to service_role;
insert into public.app_profiles(user_id,role,active)
select id,case when lower(email)='lucas.costa@terranourbanismo.com.br' and email_confirmed_at is not null then 'administrador' else 'engenheiro' end,
lower(email)='lucas.costa@terranourbanismo.com.br' and email_confirmed_at is not null from auth.users;
create function private.ensure_app_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.app_profiles(user_id) values(new.id) on conflict do nothing;return new;end $$;
revoke all on function private.ensure_app_profile() from public,anon,authenticated;
create trigger app_profile_created after insert on auth.users for each row execute function private.ensure_app_profile();
create function private.is_app_admin() returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.app_profiles where user_id=auth.uid() and active and role='administrador')
$$;
create function private.is_global_manager() returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.app_profiles where user_id=auth.uid() and active and role<>'engenheiro')
$$;
create function private.allowed_work(p_user uuid,p_work uuid,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
select p_user is not null and exists(select 1 from public.app_profiles p join public.works w on w.id=p_work where p.user_id=p_user and p.active and
(p.role<>'engenheiro' or w.owner_id=p_user or exists(select 1 from public.work_members m where m.work_id=w.id and m.user_id=p_user and (not p_write or m.role='editor'))))
$$;
create function private.current_work_access(p_work uuid,p_write boolean) returns boolean language sql stable security definer set search_path='' as $$
select private.allowed_work(auth.uid(),p_work,p_write)
$$;
revoke all on function private.is_app_admin(),private.is_global_manager(),private.allowed_work(uuid,uuid,boolean),private.current_work_access(uuid,boolean) from public,anon,authenticated;
grant usage on schema private to authenticated,service_role;
grant execute on function private.is_app_admin(),private.is_global_manager(),private.current_work_access(uuid,boolean) to authenticated,service_role;
grant execute on function private.allowed_work(uuid,uuid,boolean) to service_role;
create policy profiles_read on public.app_profiles for select to authenticated using(user_id=auth.uid() or private.is_app_admin());
create or replace function public.can_access_work(target_work uuid,needs_write boolean default false) returns boolean language sql stable security invoker set search_path='' as $$
select private.current_work_access(target_work,needs_write)
$$;
alter policy work_read on public.works using(public.can_access_work(id,false));
alter policy work_create on public.works with check(owner_id=auth.uid() and private.is_global_manager());
alter policy work_update on public.works using(public.can_access_work(id,true)) with check(public.can_access_work(id,true));
alter policy membership_self_read on public.work_members using((user_id=auth.uid() and exists(select 1 from public.app_profiles where user_id=auth.uid() and active)) or private.is_app_admin());
grant insert,update on public.work_fronts to authenticated;
create policy fronts_create on public.work_fronts for insert to authenticated with check(public.can_access_work(work_id,true));
create policy fronts_update on public.work_fronts for update to authenticated using(public.can_access_work(work_id,true)) with check(public.can_access_work(work_id,true));
create unique index work_fronts_normalized_name on public.work_fronts(work_id,lower(trim(name)));
create function public.my_work_permissions() returns table(work_id uuid,can_write boolean) language sql stable security invoker set search_path='' as $$
select w.id,public.can_access_work(w.id,true) from public.works w
$$;
create function private.list_app_access() returns table(user_id uuid,email text,role text,active boolean,work_ids uuid[],editable_ids uuid[]) language plpgsql security definer set search_path='' as $$
begin
 if not private.is_app_admin() then raise exception 'Somente administrador';end if;
 return query select p.user_id,u.email::text,p.role,p.active,
 coalesce((select array_agg(m.work_id) from public.work_members m where m.user_id=p.user_id),'{}'::uuid[]),
 coalesce((select array_agg(m.work_id) from public.work_members m where m.user_id=p.user_id and m.role='editor'),'{}'::uuid[])
 from public.app_profiles p join auth.users u on u.id=p.user_id order by u.email;
end $$;
create function public.list_app_access() returns table(user_id uuid,email text,role text,active boolean,work_ids uuid[],editable_ids uuid[]) language sql security invoker set search_path='' as $$
select * from private.list_app_access()
$$;
create function private.set_app_access(p_user uuid,p_role text,p_active boolean,p_works uuid[],p_editable uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_app_admin() then raise exception 'Somente administrador';end if;
 perform pg_advisory_xact_lock(829374);
 if p_role not in ('administrador','diretor','coordenador_comercial','coordenador_obras','engenheiro') or p_active is null then raise exception 'Perfil inválido';end if;
 if p_user=auth.uid() and (not p_active or p_role<>'administrador') then raise exception 'Você não pode remover seu próprio acesso administrativo';end if;
 if not exists(select 1 from public.app_profiles where user_id=p_user) then raise exception 'Conta inexistente';end if;
 if exists(select 1 from unnest(p_works) x where not exists(select 1 from public.works where id=x)) or not coalesce(p_editable,'{}')<@coalesce(p_works,'{}') then raise exception 'Obras inválidas';end if;
 update public.app_profiles set role=p_role,active=p_active where user_id=p_user;
 delete from public.work_members where user_id=p_user;
 if p_role='engenheiro' then
 insert into public.work_members(work_id,user_id,role) select distinct x,p_user,case when x=any(coalesce(p_editable,'{}')) then 'editor' else 'viewer' end from unnest(p_works) x;
 end if;
end $$;
create function public.set_app_access(p_user uuid,p_role text,p_active boolean,p_works uuid[],p_editable uuid[]) returns void language sql security invoker set search_path='' as $$
select private.set_app_access(p_user,p_role,p_active,p_works,p_editable)
$$;
revoke all on function private.list_app_access(),private.set_app_access(uuid,text,boolean,uuid[],uuid[]),public.list_app_access(),public.set_app_access(uuid,text,boolean,uuid[],uuid[]),public.my_work_permissions() from public,anon;
grant execute on function private.list_app_access(),private.set_app_access(uuid,text,boolean,uuid[],uuid[]),public.list_app_access(),public.set_app_access(uuid,text,boolean,uuid[],uuid[]),public.my_work_permissions() to authenticated;
create table public.work_documents (
 id uuid primary key default gen_random_uuid(),
 work_id uuid not null references public.works(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 200),
 category text not null default 'Outros',
 filename text not null,
 storage_path text not null unique,
 size_bytes bigint not null check(size_bytes between 1 and 26214400),
 uploaded_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 check(split_part(storage_path,'/',1)=work_id::text and split_part(storage_path,'/',2)=uploaded_by::text)
);
create index work_documents_work_idx on public.work_documents(work_id);
create index work_documents_uploader_idx on public.work_documents(uploaded_by);
alter table public.work_documents enable row level security;
revoke all on public.work_documents from anon,authenticated;
grant select,insert on public.work_documents to authenticated;
grant all on public.work_documents to service_role;
create policy documents_read on public.work_documents for select to authenticated using(public.can_access_work(work_id,false));
create policy documents_create on public.work_documents for insert to authenticated with check(uploaded_by=auth.uid() and public.can_access_work(work_id,true));
insert into storage.buckets(id,name,public,file_size_limit) values('work-documents','work-documents',false,26214400);
create policy documents_storage_read on storage.objects for select to authenticated using(bucket_id='work-documents' and exists(select 1 from public.work_documents d where d.storage_path=storage.objects.name and public.can_access_work(d.work_id,false)));
create policy documents_storage_create on storage.objects for insert to authenticated with check(bucket_id='work-documents' and (storage.foldername(storage.objects.name))[2]=auth.uid()::text and exists(select 1 from public.works w where w.id::text=(storage.foldername(storage.objects.name))[1] and public.can_access_work(w.id,true)));
create policy documents_failed_upload_cleanup on storage.objects for delete to authenticated using(bucket_id='work-documents' and owner_id=auth.uid()::text and not exists(select 1 from public.work_documents d where d.storage_path=storage.objects.name));

