-- Cotações: registra quando o fornecedor abre o link e permite anexar projetos depois de criada.
alter table public.quote_invites
 add column first_opened_at timestamptz,
 add column last_opened_at timestamptz,
 add column open_count integer not null default 0 check(open_count>=0);

create or replace function private.supplier_quote(p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare inv public.quote_invites; q public.quote_requests; previous jsonb;
begin
 select * into inv from public.quote_invites where token=p_token and active;
 if not found then raise exception 'Convite inválido ou desativado'; end if;
 select * into q from public.quote_requests where id=inv.quote_id;
 if q.status='cancelada' then raise exception 'Cotação cancelada'; end if;
 update public.quote_invites set first_opened_at=coalesce(first_opened_at,now()),last_opened_at=now(),open_count=open_count+1 where id=inv.id;
 select jsonb_build_object('id',p.id,'version',p.version,'notes',p.notes,'cnpj',p.cnpj,'contact',p.contact,'supplier_name',p.supplier_name,'total',p.total,'prices',(select jsonb_agg(jsonb_build_object('item_id',pr.item_id,'unit_price',pr.unit_price)) from public.quote_prices pr where pr.proposal_id=p.id))
 into previous from public.quote_proposals p where p.invite_id=inv.id order by p.version desc limit 1;
 return jsonb_build_object('id',q.id,'name',q.name,'work',(select name from public.works where id=q.work_id),'front',(select name from public.work_fronts where id=q.front_id),'deadline',q.deadline,'notes',q.notes,'supplier',inv.supplier_name,'email',inv.email,
 'can_submit',q.status='aberta' and q.deadline>=current_date and inv.revision_allowed,
 'previous',previous,
 'items',coalesce((select jsonb_agg(to_jsonb(i) order by i.source_row,i.code) from public.quote_items i where i.quote_id=q.id),'[]'),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',wd.id,'title',wd.title,'filename',wd.filename,'storage_path',wd.storage_path,'size_bytes',wd.size_bytes) order by wd.title) from public.quote_documents qd join public.work_documents wd on wd.id=qd.document_id where qd.quote_id=q.id),'[]'));
end $$;

create function private.add_quote_documents(p_quote uuid,p_documents uuid[]) returns integer language plpgsql security definer set search_path='' as $$
declare q public.quote_requests; added integer;
begin
 select * into q from public.quote_requests where id=p_quote for update;
 if not found or auth.uid() is null or not public.can_access_work(q.work_id,true) then raise exception 'Sem acesso para anexar projetos nesta cotação'; end if;
 if q.status in ('aprovada','cancelada') then raise exception 'Cotação encerrada'; end if;
 if p_documents is null or cardinality(p_documents) not between 1 and 2000 then raise exception 'Selecione os projetos'; end if;
 if exists(select 1 from unnest(p_documents) d where not exists(select 1 from public.work_documents wd where wd.id=d and wd.work_id=q.work_id)) then raise exception 'Documento pertence a outra obra'; end if;
 insert into public.quote_documents(quote_id,document_id) select q.id,d from (select distinct unnest(p_documents) d) docs on conflict do nothing;
 get diagnostics added=row_count;
 return added;
end $$;
revoke all on function private.add_quote_documents(uuid,uuid[]) from public,anon,authenticated;
grant execute on function private.add_quote_documents(uuid,uuid[]) to authenticated;
create function public.add_quote_documents(p_quote uuid,p_documents uuid[]) returns integer language sql set search_path='' as $$ select private.add_quote_documents(p_quote,p_documents) $$;
revoke all on function public.add_quote_documents(uuid,uuid[]) from public,anon;
grant execute on function public.add_quote_documents(uuid,uuid[]) to authenticated;
