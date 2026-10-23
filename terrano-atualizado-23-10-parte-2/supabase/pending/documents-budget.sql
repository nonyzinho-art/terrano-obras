alter table public.work_documents add constraint work_documents_id_work_unique unique(id,work_id);
create table public.budget_documents (
 id uuid primary key default gen_random_uuid(),
 budget_id uuid not null, document_id uuid not null, work_id uuid not null,
 linked_by uuid not null default auth.uid() references auth.users(id),
 linked_at timestamptz not null default now(),
 unique(budget_id,document_id),
 foreign key(budget_id,work_id) references public.budgets(id,work_id),
 foreign key(document_id,work_id) references public.work_documents(id,work_id)
);
create index budget_documents_work_idx on public.budget_documents(work_id);
create index budget_documents_document_idx on public.budget_documents(document_id);
alter table public.budget_documents enable row level security;
revoke all on public.budget_documents from anon,authenticated;
grant select,insert,delete on public.budget_documents to authenticated;
grant all on public.budget_documents to service_role;
create policy budget_documents_read on public.budget_documents for select to authenticated using(public.can_access_work(work_id,false));
create policy budget_documents_link on public.budget_documents for insert to authenticated with check(linked_by=(select auth.uid()) and public.can_access_work(work_id,true));
create policy budget_documents_unlink on public.budget_documents for delete to authenticated using(public.can_access_work(work_id,true));
create function public.link_budget_document(p_budget uuid,p_document uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare w uuid;
begin
 select work_id into w from public.budgets where id=p_budget;
 if not found then raise exception 'Orçamento não disponível';end if;
 insert into public.budget_documents(budget_id,document_id,work_id) values(p_budget,p_document,w) on conflict(budget_id,document_id) do nothing;
end $$;
revoke all on function public.link_budget_document(uuid,uuid) from public,anon;
grant execute on function public.link_budget_document(uuid,uuid) to authenticated;
