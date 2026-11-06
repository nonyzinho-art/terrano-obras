
alter table public.quote_invites add column creation_key uuid unique;
create function private.add_quote_supplier(p_quote uuid,p_key uuid,p_name text,p_email text,p_deadline date) returns uuid language plpgsql security definer set search_path='' as $$
declare q public.quote_requests; invite uuid;
begin
 select * into q from public.quote_requests where id=p_quote for update;
 if not found or auth.uid() is null or not public.can_access_work(q.work_id,true) then raise exception 'Sem acesso para adicionar fornecedor'; end if;
 select id into invite from public.quote_invites where quote_id=q.id and creation_key=p_key;
 if found then return invite; end if;
 if q.status<>'aberta' then raise exception 'Reabra a cotação para negociação antes de adicionar fornecedores'; end if;
 if p_key is null or length(trim(coalesce(p_name,''))) not between 1 and 200 or length(coalesce(p_email,''))>254 then raise exception 'Confira os dados do fornecedor'; end if;
 if p_deadline is null or p_deadline<current_date then raise exception 'Informe um prazo válido para receber a proposta'; end if;
 if (select count(*) from public.quote_invites where quote_id=q.id)>=100 then raise exception 'Limite de 100 fornecedores por cotação'; end if;
 if exists(select 1 from public.quote_invites where quote_id=q.id and active and (lower(trim(supplier_name))=lower(trim(p_name)) or (trim(coalesce(p_email,''))<>'' and lower(trim(email))=lower(trim(p_email))))) then raise exception 'Este fornecedor já foi convidado. Copie o link existente'; end if;
 insert into public.quote_invites(quote_id,creation_key,supplier_name,email) values(q.id,p_key,trim(p_name),trim(coalesce(p_email,''))) returning id into invite;
 update public.quote_requests set deadline=p_deadline where id=q.id;
 return invite;
end $$;
create function public.add_quote_supplier(p_quote uuid,p_key uuid,p_name text,p_email text,p_deadline date) returns uuid language sql set search_path='' as $$ select private.add_quote_supplier(p_quote,p_key,p_name,p_email,p_deadline) $$;
revoke all on function private.add_quote_supplier(uuid,uuid,text,text,date),public.add_quote_supplier(uuid,uuid,text,text,date) from public,anon;
grant execute on function private.add_quote_supplier(uuid,uuid,text,text,date),public.add_quote_supplier(uuid,uuid,text,text,date) to authenticated;

