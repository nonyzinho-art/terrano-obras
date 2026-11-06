
create table public.quote_requests (
 id uuid primary key default gen_random_uuid(), work_id uuid not null references public.works(id), front_id uuid not null references public.work_fronts(id),
 name text not null check(length(trim(name)) between 1 and 120), deadline date not null, notes text not null default '', source_filename text,
 status text not null default 'aberta' check(status in ('aberta','em_aprovacao','aprovada','cancelada')),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 selected_proposal uuid, approval_cycle integer not null default 0, budget_id uuid references public.budgets(id), creation_key uuid not null unique
);
create table public.quote_items (
 id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.quote_requests(id),
 code text not null, description text not null, unit text not null, quantity numeric not null check(quantity>0 and quantity<=1e12),
 hierarchy jsonb not null default '[]', "group" text not null default '', source_row integer, unique(quote_id,code)
);
create table public.quote_invites (
 id uuid primary key default gen_random_uuid(), quote_id uuid not null references public.quote_requests(id), supplier_name text not null check(length(trim(supplier_name)) between 1 and 200),
 email text not null default '', token uuid not null default gen_random_uuid() unique, active boolean not null default true, revision_allowed boolean not null default true
);
create table public.quote_proposals (
 id uuid primary key default gen_random_uuid(), invite_id uuid not null references public.quote_invites(id),
 version integer not null, submit_key uuid not null unique, supplier_name text not null, cnpj text not null default '', contact text not null default '',
 notes text not null default '', total numeric not null check(total>0), created_at timestamptz not null default now(), unique(invite_id,version)
);
create table public.quote_prices (
 proposal_id uuid not null references public.quote_proposals(id), item_id uuid not null references public.quote_items(id),
 unit_price numeric check(unit_price>0 and unit_price<=1e9), primary key(proposal_id,item_id)
);
alter table public.quote_requests add constraint quote_selected_fk foreign key(selected_proposal) references public.quote_proposals(id);
create table public.quote_documents (
 quote_id uuid not null references public.quote_requests(id), document_id uuid not null references public.work_documents(id),
 primary key(quote_id,document_id)
);
create table public.quote_approvals (
 quote_id uuid not null references public.quote_requests(id), cycle integer not null,
 role text not null check(role in ('coordenador_obras','coordenador_comercial','diretor')),
 actor uuid not null default auth.uid() references auth.users(id), decided_at timestamptz not null default now(),
 primary key(quote_id,cycle,role)
);
create index quote_work_idx on public.quote_requests(work_id);
create index quote_front_idx on public.quote_requests(front_id);
create index quote_invite_request_idx on public.quote_invites(quote_id);
create index quote_document_document_idx on public.quote_documents(document_id);
create index quote_price_item_idx on public.quote_prices(item_id);
create index quote_approvals_actor_idx on public.quote_approvals(actor);
create index quote_requests_creator_idx on public.quote_requests(created_by);
create index quote_requests_selected_idx on public.quote_requests(selected_proposal);
create index quote_requests_budget_idx on public.quote_requests(budget_id);
create function private.quote_work(p_quote uuid) returns uuid language sql stable security definer set search_path='' as $$ select work_id from public.quote_requests where id=p_quote $$;
revoke all on function private.quote_work(uuid) from public,anon,authenticated;
grant execute on function private.quote_work(uuid) to authenticated,service_role;

alter table public.quote_requests enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_invites enable row level security;
alter table public.quote_proposals enable row level security;
alter table public.quote_prices enable row level security;
alter table public.quote_documents enable row level security;
alter table public.quote_approvals enable row level security;
grant select on public.quote_requests, public.quote_items, public.quote_invites, public.quote_proposals, public.quote_prices, public.quote_documents, public.quote_approvals to authenticated;
revoke all on public.quote_requests, public.quote_items, public.quote_invites, public.quote_proposals, public.quote_prices, public.quote_documents, public.quote_approvals from anon;
create policy quotes_read on public.quote_requests for select to authenticated using(public.can_access_work(work_id,false));
create policy quote_items_read on public.quote_items for select to authenticated using(public.can_access_work(private.quote_work(quote_id),false));
create policy quote_invites_read on public.quote_invites for select to authenticated using(public.can_access_work(private.quote_work(quote_id),false));
create policy quote_proposals_read on public.quote_proposals for select to authenticated using(exists(select 1 from public.quote_invites i where i.id=invite_id));
create policy quote_prices_read on public.quote_prices for select to authenticated using(exists(select 1 from public.quote_proposals p where p.id=proposal_id));
create policy quote_docs_read on public.quote_documents for select to authenticated using(public.can_access_work(private.quote_work(quote_id),false));
create policy quote_approvals_read on public.quote_approvals for select to authenticated using(public.can_access_work(private.quote_work(quote_id),false));

create function private.create_quote(p_key uuid,p_work uuid,p_front uuid,p_name text,p_deadline date,p_notes text,p_filename text,p_items jsonb,p_suppliers jsonb,p_documents uuid[]) returns uuid
language plpgsql security definer set search_path='' as $$
declare q uuid; it jsonb; supplier jsonb;
begin
 if auth.uid() is null or not public.can_access_work(p_work,true) then raise exception 'Sem permissão para criar cotação'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_key::text,0));
 select id into q from public.quote_requests where creation_key=p_key and created_by=auth.uid();
 if found then return q; end if;
 if p_deadline < current_date or p_deadline is null then raise exception 'Informe um prazo válido'; end if;
 if not exists(select 1 from public.work_fronts where id=p_front and work_id=p_work and active) then raise exception 'Frente inválida'; end if;
 if not exists(select 1 from public.works where id=p_work and status<>'concluida') then raise exception 'Obra concluída'; end if;
 if jsonb_typeof(p_items)<>'array' or coalesce(jsonb_array_length(p_items),0) not between 1 and 10000 then raise exception 'Confira os itens'; end if;
 if jsonb_typeof(p_suppliers)<>'array' or coalesce(jsonb_array_length(p_suppliers),0) not between 1 and 100 then raise exception 'Informe entre 1 e 100 fornecedores'; end if;
 if length(coalesce(p_notes,''))>10000 then raise exception 'Observação muito longa'; end if;
 if exists(select 1 from unnest(p_documents) d where not exists(select 1 from public.work_documents wd where wd.id=d and wd.work_id=p_work)) then raise exception 'Documento pertence a outra obra'; end if;
 insert into public.quote_requests(creation_key,work_id,front_id,name,deadline,notes,source_filename) values(p_key,p_work,p_front,trim(p_name),p_deadline,coalesce(p_notes,''),p_filename) returning id into q;
 for it in select * from jsonb_array_elements(p_items) loop
  if length(trim(coalesce(it->>'code','')))=0 or length(trim(coalesce(it->>'description','')))=0 or length(trim(coalesce(it->>'unit','')))=0 or (it->>'quantity') is null then raise exception 'Item sem código, descrição, unidade ou quantidade'; end if;
  insert into public.quote_items(quote_id,code,description,unit,quantity,hierarchy,"group",source_row)
   values(q,it->>'code',it->>'description',it->>'unit',(it->>'quantity')::numeric,coalesce(it->'hierarchy','[]'),coalesce(it->>'group',''),(it->>'row')::integer);
 end loop;
 for supplier in select * from jsonb_array_elements(p_suppliers) loop
  insert into public.quote_invites(quote_id,supplier_name,email) values(q,trim(supplier->>'name'),coalesce(supplier->>'email',''));
 end loop;
 insert into public.quote_documents select q,d from (select distinct unnest(p_documents) d) docs;
 return q;
end $$;
create function public.create_quote(p_key uuid,p_work uuid,p_front uuid,p_name text,p_deadline date,p_notes text,p_filename text,p_items jsonb,p_suppliers jsonb,p_documents uuid[]) returns uuid language sql set search_path='' as $$ select private.create_quote(p_key,p_work,p_front,p_name,p_deadline,p_notes,p_filename,p_items,p_suppliers,p_documents) $$;
revoke all on function private.create_quote(uuid,uuid,uuid,text,date,text,text,jsonb,jsonb,uuid[]) from public,anon;
revoke all on function public.create_quote(uuid,uuid,uuid,text,date,text,text,jsonb,jsonb,uuid[]) from public,anon;
grant execute on function private.create_quote(uuid,uuid,uuid,text,date,text,text,jsonb,jsonb,uuid[]),public.create_quote(uuid,uuid,uuid,text,date,text,text,jsonb,jsonb,uuid[]) to authenticated;

create function private.supplier_quote(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare inv public.quote_invites; q public.quote_requests; previous jsonb;
begin
 select * into inv from public.quote_invites where token=p_token and active;
 if not found then raise exception 'Convite inválido ou desativado'; end if;
 select * into q from public.quote_requests where id=inv.quote_id;
 if q.status='cancelada' then raise exception 'Cotação cancelada'; end if;
 select jsonb_build_object('id',p.id,'version',p.version,'notes',p.notes,'cnpj',p.cnpj,'contact',p.contact,'supplier_name',p.supplier_name,'total',p.total,'prices',(select jsonb_agg(jsonb_build_object('item_id',pr.item_id,'unit_price',pr.unit_price)) from public.quote_prices pr where pr.proposal_id=p.id))
 into previous from public.quote_proposals p where p.invite_id=inv.id order by p.version desc limit 1;
 return jsonb_build_object('id',q.id,'name',q.name,'work',(select name from public.works where id=q.work_id),'front',(select name from public.work_fronts where id=q.front_id),'deadline',q.deadline,'notes',q.notes,'supplier',inv.supplier_name,'email',inv.email,
 'can_submit',q.status='aberta' and q.deadline>=current_date and inv.revision_allowed,
 'previous',previous,
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.source_row,i.code) from public.quote_items i where i.quote_id=q.id),'[]'),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',wd.id,'title',wd.title,'filename',wd.filename,'storage_path',wd.storage_path)) from public.quote_documents qd join public.work_documents wd on wd.id=qd.document_id where qd.quote_id=q.id),'[]'));
end $$;
create function public.supplier_quote(p_token uuid) returns jsonb language sql set search_path='' as $$ select private.supplier_quote(p_token) $$;
revoke all on function private.supplier_quote(uuid),public.supplier_quote(uuid) from public;
grant execute on function private.supplier_quote(uuid),public.supplier_quote(uuid) to anon,authenticated,service_role;

create function private.submit_quote(p_token uuid,p_key uuid,p_name text,p_cnpj text,p_contact text,p_notes text,p_prices jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.quote_invites; q public.quote_requests; version_n integer; proposal uuid; amount numeric; price jsonb; total_n numeric:=0; count_n integer;
begin
 select * into inv from public.quote_invites where token=p_token and active;
 if not found then raise exception 'Convite inválido'; end if;
 select * into q from public.quote_requests where id=inv.quote_id for update;
 select * into inv from public.quote_invites where id=inv.id for update;
 select id into proposal from public.quote_proposals where submit_key=p_key and invite_id=inv.id;
 if found then return proposal; end if;
 if q.status<>'aberta' or q.deadline<current_date or not inv.active or not inv.revision_allowed then raise exception 'Envio encerrado. Solicite a liberação de revisão à Terrano'; end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 200 or length(coalesce(p_cnpj,''))>40 or length(coalesce(p_contact,''))>200 or length(coalesce(p_notes,''))>10000 then raise exception 'Confira os dados da proposta'; end if;
 select count(*) into count_n from public.quote_items where quote_id=q.id;
 if p_prices is null or jsonb_typeof(p_prices)<>'array' or jsonb_array_length(p_prices)<>count_n then raise exception 'Confira todos os itens'; end if;
 if (select count(distinct (v->>'item_id')) from jsonb_array_elements(p_prices) v)<>count_n then raise exception 'Item repetido'; end if;
 for price in select * from jsonb_array_elements(p_prices) loop
  if not exists(select 1 from public.quote_items where id=(price->>'item_id')::uuid and quote_id=q.id) then raise exception 'Item de outra cotação'; end if;
  amount:=(price->>'unit_price')::numeric;
  if amount is not null and (amount<=0 or amount>1e9 or round(amount,2)<>amount) then raise exception 'Preço inválido: use até duas casas decimais'; end if;
  if amount is not null then total_n:=total_n+(select round(quantity*amount,2) from public.quote_items where id=(price->>'item_id')::uuid); end if;
 end loop;
 if total_n<=0 then raise exception 'Cote ao menos um item'; end if;
 select coalesce(max(version),0)+1 into version_n from public.quote_proposals where invite_id=inv.id;
 insert into public.quote_proposals(invite_id,version,submit_key,supplier_name,cnpj,contact,notes,total)
 values(inv.id,version_n,p_key,trim(p_name),coalesce(p_cnpj,''),coalesce(p_contact,''),coalesce(p_notes,''),total_n) returning id into proposal;
 insert into public.quote_prices(proposal_id,item_id,unit_price) select proposal,(v->>'item_id')::uuid,(v->>'unit_price')::numeric from jsonb_array_elements(p_prices) v;
 update public.quote_invites set revision_allowed=false where id=inv.id;
 return proposal;
end $$;
create function public.submit_quote(p_token uuid,p_key uuid,p_name text,p_cnpj text,p_contact text,p_notes text,p_prices jsonb) returns uuid language sql set search_path='' as $$ select private.submit_quote(p_token,p_key,p_name,p_cnpj,p_contact,p_notes,p_prices) $$;
revoke all on function private.submit_quote(uuid,uuid,text,text,text,text,jsonb),public.submit_quote(uuid,uuid,text,text,text,text,jsonb) from public;
grant execute on function private.submit_quote(uuid,uuid,text,text,text,text,jsonb),public.submit_quote(uuid,uuid,text,text,text,text,jsonb) to anon,authenticated,service_role;

create function private.quote_action(p_quote uuid,p_action text,p_target uuid default null,p_role text default null) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.quote_requests; actor_role text; proposal public.quote_proposals; item_payload jsonb; b uuid;
begin
 select * into q from public.quote_requests where id=p_quote for update;
 if not found or auth.uid() is null or not public.can_access_work(q.work_id,true) then raise exception 'Sem acesso para alterar a cotação'; end if;
 select role into actor_role from public.app_profiles where user_id=auth.uid() and active;
 if q.status in ('aprovada','cancelada') then raise exception 'Cotação encerrada'; end if;
 if p_action='cancelar' then
  update public.quote_requests set status='cancelada' where id=q.id; return q.id;
 elsif p_action='revisao' then
  if q.status<>'aberta' then raise exception 'A cotação já está em aprovação'; end if;
  update public.quote_invites set revision_allowed=true where id=p_target and quote_id=q.id and active;
  if not found then raise exception 'Fornecedor inválido'; end if; return q.id;
 elsif p_action='desativar_convite' then
  update public.quote_invites set active=false where id=p_target and quote_id=q.id;
  if not found then raise exception 'Fornecedor inválido'; end if; return q.id;
 elsif p_action='selecionar' then
  select p.* into proposal from public.quote_proposals p join public.quote_invites i on i.id=p.invite_id where p.id=p_target and i.quote_id=q.id and i.active;
  if not found then raise exception 'Proposta inválida'; end if;
  if proposal.version<>(select max(version) from public.quote_proposals where invite_id=proposal.invite_id) then raise exception 'Selecione a revisão mais recente'; end if;
  if exists(select 1 from public.quote_prices where proposal_id=proposal.id and unit_price is null) then raise exception 'A proposta possui itens não cotados. Solicite revisão antes de aprovar'; end if;
  update public.quote_requests set selected_proposal=proposal.id,status='em_aprovacao',approval_cycle=approval_cycle+1 where id=q.id;
  return q.id;
 elsif p_action='reabrir' then
  if actor_role='engenheiro' then raise exception 'Somente a coordenação pode reabrir'; end if;
  update public.quote_requests set status='aberta',selected_proposal=null,approval_cycle=approval_cycle+1 where id=q.id;
  return q.id;
 elsif p_action='aprovar' then
  if p_role not in ('coordenador_obras','coordenador_comercial','diretor') or p_role is null or (actor_role<>'administrador' and actor_role<>p_role) then raise exception 'Você não pode aprovar por este perfil'; end if;
  if q.status<>'em_aprovacao' or q.selected_proposal is null then raise exception 'Selecione uma proposta para aprovação'; end if;
  insert into public.quote_approvals(quote_id,cycle,role) values(q.id,q.approval_cycle,p_role) on conflict do nothing;
  if (select count(*) from public.quote_approvals where quote_id=q.id and cycle=q.approval_cycle)=3 then
   select jsonb_agg(jsonb_build_object('code',i.code,'description',i.description,'unit',i.unit,'quantity',i.quantity,'unitPrice',p.unit_price,'sourceTotal',round(i.quantity*p.unit_price,2),'row',i.source_row,'group',i."group",'hierarchy',i.hierarchy) order by i.source_row,i.code) into item_payload
    from public.quote_items i join public.quote_prices p on p.item_id=i.id and p.proposal_id=q.selected_proposal where i.quote_id=q.id;
   b:=public.import_budget(q.creation_key,q.work_id,q.name,q.source_filename,item_payload);
   update public.quote_requests set status='aprovada',budget_id=b where id=q.id;
   return b;
  end if;
  return q.id;
 end if;
 raise exception 'Ação inválida';
end $$;
create function public.quote_action(p_quote uuid,p_action text,p_target uuid default null,p_role text default null) returns uuid language sql set search_path='' as $$ select private.quote_action(p_quote,p_action,p_target,p_role) $$;
revoke all on function private.quote_action(uuid,text,uuid,text),public.quote_action(uuid,text,uuid,text) from public,anon;
grant execute on function private.quote_action(uuid,text,uuid,text),public.quote_action(uuid,text,uuid,text) to authenticated;

