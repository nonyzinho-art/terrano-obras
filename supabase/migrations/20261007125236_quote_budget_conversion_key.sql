alter table public.quote_requests add column budget_import_key uuid not null default gen_random_uuid();
create or replace function private.quote_action(p_quote uuid,p_action text,p_target uuid default null,p_role text default null) returns uuid language plpgsql security definer set search_path='' as $$
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
   b:=public.import_budget(q.budget_import_key,q.work_id,q.name,q.source_filename,item_payload);
   update public.quote_requests set status='aprovada',budget_id=b where id=q.id;
   return b;
  end if;
  return q.id;
 end if;
 raise exception 'Ação inválida';
end $$;

