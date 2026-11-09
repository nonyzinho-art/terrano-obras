-- Adiantamentos descontados na medição (pagamentos feitos pela Terrano em nome do empreiteiro)
-- e retenção contratual opcional (% do valor medido). O saldo de adiantamento que não couber
-- numa medição passa para a seguinte (cálculo no aplicativo, a partir das medições aprovadas).
alter table public.budgets add column retention_percent numeric(5,2) not null default 0 check(retention_percent between 0 and 100);
alter table public.budget_measurements add column retention_percent numeric(5,2) not null default 0 check(retention_percent between 0 and 100);

create table public.budget_measurement_advances (
 id uuid primary key default gen_random_uuid(),
 measurement_id uuid not null, budget_id uuid not null, work_id uuid not null,
 position integer not null check(position>0),
 supplier text not null check(length(trim(supplier)) between 1 and 200),
 invoice text not null default '' check(length(invoice)<=60),
 uau_process text not null default '' check(length(uau_process)<=40),
 paid_on date,
 description text not null default '' check(length(description)<=500),
 amount numeric(14,2) not null check(amount>0),
 source text not null default 'manual' check(source in ('manual','uau')),
 unique(measurement_id,position),
 foreign key(measurement_id,budget_id,work_id) references public.budget_measurements(id,budget_id,work_id) on delete cascade
);
create index budget_measurement_advances_measurement_idx on public.budget_measurement_advances(measurement_id);
create index budget_measurement_advances_process_idx on public.budget_measurement_advances(budget_id,uau_process) where uau_process<>'';
create index budget_measurement_advances_work_idx on public.budget_measurement_advances(work_id);
alter table public.budget_measurement_advances enable row level security;
revoke all on public.budget_measurement_advances from anon,authenticated;
grant select on public.budget_measurement_advances to authenticated;
grant all on public.budget_measurement_advances to service_role;
create policy measurement_advances_read on public.budget_measurement_advances for select to authenticated using(public.can_access_work(work_id,false));

create or replace function private.budget_measurement_action(p_action text,p_payload jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); b public.budgets%rowtype; m public.budget_measurements%rowtype;
 ident uuid:=(p_payload->>'id')::uuid; bid uuid:=(p_payload->>'budget_id')::uuid;
 role_name text; first_day date; last_day date; raw record; it public.budget_items%rowtype; qty numeric; used numeric; can_approve boolean;
 pct numeric; amt numeric; proc text; pos integer:=0; clash text;
begin
 if u is null then raise exception 'Entre na sua conta';end if;
 select role into role_name from public.app_profiles where user_id=u and active;
 select * into b from public.budgets where id=bid for update;
 if not found or role_name is null or not private.allowed_work(u,b.work_id,true) then raise exception 'Sem acesso a este orçamento';end if;
 can_approve:=role_name in ('administrador','diretor','coordenador_obras');
 if exists(select 1 from public.budgets newer where newer.work_id=b.work_id and lower(trim(newer.name))=lower(trim(b.name)) and newer.status='aprovado' and newer.revision>b.revision) then raise exception 'Use a revisão aprovada mais recente deste orçamento';end if;
 if p_action='planejar' then
  first_day:=(p_payload->>'planned_start')::date;last_day:=(p_payload->>'planned_end')::date;
  if b.status<>'aprovado' or first_day is null or last_day is null or last_day<first_day or not exists(select 1 from public.works where id=b.work_id and first_day>=start_date and last_day<=end_date) then raise exception 'Defina datas válidas dentro do período da obra';end if;
  update public.budgets set planned_start=first_day,planned_end=last_day,updated_at=now() where id=bid;return bid;
 end if;
 if p_action='retencao' then
  if not can_approve then raise exception 'Somente coordenador de obras, diretor ou administrador pode definir a retenção';end if;
  if b.status<>'aprovado' then raise exception 'Selecione um orçamento aprovado';end if;
  pct:=(p_payload->>'retention_percent')::numeric;
  if pct is null or pct::text in ('NaN','Infinity','-Infinity') or pct<0 or pct>100 or pct<>round(pct,2) then raise exception 'Informe a retenção entre 0 e 100%%, com até duas casas decimais';end if;
  update public.budgets set retention_percent=pct where id=bid;return bid;
 end if;
 if ident is null then raise exception 'Identificação da medição obrigatória';end if;
 select * into m from public.budget_measurements where id=ident for update;
 if p_action='revisar' then
  if not can_approve or m.id is null or m.budget_id<>bid or m.status<>'aprovada' then raise exception 'Somente um responsável pela aprovação pode revisar uma medição aprovada';end if;
  if nullif(trim(p_payload->>'reason'),'') is null or length(trim(p_payload->>'reason'))<10 or length(p_payload->>'reason')>5000 then raise exception 'Informe a justificativa da revisão, com pelo menos 10 caracteres';end if;
  if (p_payload->>'new_id')::uuid is null then raise exception 'Identificação da revisão obrigatória';end if;
  if b.status<>'aprovado' or b.execution_status<>'em_execucao' then raise exception 'O orçamento precisa estar em execução para criar uma revisão';end if;
  insert into public.budget_measurements(id,budget_id,work_id,period_start,period_end,notes,created_by,replaces_id,revision_reason,retention_percent)
  values((p_payload->>'new_id')::uuid,bid,b.work_id,m.period_start,m.period_end,m.notes,u,m.id,trim(p_payload->>'reason'),m.retention_percent);
  insert into public.budget_measurement_items(measurement_id,budget_id,work_id,budget_item_id,quantity,unit_price,planned_quantity)
  select (p_payload->>'new_id')::uuid,budget_id,work_id,budget_item_id,quantity,unit_price,planned_quantity from public.budget_measurement_items where measurement_id=m.id;
  insert into public.budget_measurement_advances(measurement_id,budget_id,work_id,position,supplier,invoice,uau_process,paid_on,description,amount,source)
  select (p_payload->>'new_id')::uuid,budget_id,work_id,position,supplier,invoice,uau_process,paid_on,description,amount,source from public.budget_measurement_advances where measurement_id=m.id;
  return (p_payload->>'new_id')::uuid;
 end if;

 if found and (m.budget_id<>bid or m.status<>'rascunho') then raise exception 'Esta medição não pode ser alterada';end if;
 if m.id is not null and m.created_by<>u and not can_approve then raise exception 'Somente o autor ou o responsável pela aprovação pode alterar esta medição';end if;
 if m.id is not null and p_action in ('aprovar','cancelar') and m.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Esta medição foi alterada. Atualize e confira a versão salva antes de continuar';end if;
 if p_action='salvar' then
  if b.status<>'aprovado' or b.execution_status<>'em_execucao' then raise exception 'Selecione um orçamento aprovado em execução';end if;
  if m.id is not null and m.revision is distinct from (p_payload->>'revision')::integer then raise exception 'Esta medição foi alterada por outra pessoa. Atualize a página';end if;
  first_day:=(p_payload->>'period_start')::date;last_day:=(p_payload->>'period_end')::date;
  if first_day is null or last_day is null or last_day<first_day or last_day>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Informe um período válido, sem datas futuras';end if;
  if jsonb_typeof(p_payload->'items') is distinct from 'array' or (jsonb_array_length(p_payload->'items')=0 and m.replaces_id is null) then raise exception 'Informe ao menos uma quantidade do período';end if;
  if jsonb_array_length(p_payload->'items')>10000 then raise exception 'Quantidade de itens excedida';end if;
  if exists(select 1 from jsonb_array_elements(p_payload->'items') x group by x->>'budget_item_id' having count(*)>1) then raise exception 'Item repetido na medição';end if;
  if coalesce(jsonb_typeof(p_payload->'advances'),'array')<>'array' or jsonb_array_length(coalesce(p_payload->'advances','[]'::jsonb))>500 then raise exception 'Lista de adiantamentos inválida';end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_payload->'advances','[]'::jsonb)) x where trim(coalesce(x->>'uau_process',''))<>'' group by trim(x->>'uau_process') having count(*)>1) then raise exception 'Processo UAU repetido nos adiantamentos';end if;
  if m.id is null then
   insert into public.budget_measurements(id,budget_id,work_id,period_start,period_end,notes,created_by,retention_percent) values(ident,bid,b.work_id,first_day,last_day,coalesce(p_payload->>'notes',''),u,b.retention_percent);
  else
   update public.budget_measurements set period_start=first_day,period_end=last_day,notes=coalesce(p_payload->>'notes',''),retention_percent=b.retention_percent,revision=revision+1 where id=ident;
   delete from public.budget_measurement_items where measurement_id=ident;
   delete from public.budget_measurement_advances where measurement_id=ident;
  end if;
  for raw in select value from jsonb_array_elements(p_payload->'items') loop
   select * into it from public.budget_items where id=(raw.value->>'budget_item_id')::uuid and budget_id=bid and work_id=b.work_id for update;
   if not found or it.quantity_pending or it.unit_price_pending then raise exception 'Item inválido ou com quantidade/preço pendente';end if;
   qty:=(raw.value->>'quantity')::numeric;
   if qty is null or qty::text in ('NaN','Infinity','-Infinity') or qty<=0 or qty<>round(qty,4) then raise exception 'Use uma quantidade positiva com até quatro casas decimais';end if;
   select coalesce(sum(mi.quantity),0) into used from public.budget_measurement_items mi join public.budget_measurements mh on mh.id=mi.measurement_id where mi.budget_item_id=it.id and mh.status='aprovada' and mh.id is distinct from m.replaces_id;
   if qty+used>it.planned_quantity then raise exception 'A quantidade do item % excede o saldo orçado',it.code;end if;
   insert into public.budget_measurement_items(measurement_id,budget_id,work_id,budget_item_id,quantity,unit_price,planned_quantity) values(ident,bid,b.work_id,it.id,qty,it.unit_price,it.planned_quantity);
  end loop;
  for raw in select value from jsonb_array_elements(coalesce(p_payload->'advances','[]'::jsonb)) loop
   pos:=pos+1;
   amt:=(raw.value->>'amount')::numeric;
   if amt is null or amt::text in ('NaN','Infinity','-Infinity') or amt<=0 or amt<>round(amt,2) or amt>1e10 then raise exception 'Adiantamento %: informe um valor positivo com até duas casas decimais',pos;end if;
   if length(trim(coalesce(raw.value->>'supplier','')))=0 then raise exception 'Adiantamento %: informe o fornecedor',pos;end if;
   proc:=trim(coalesce(raw.value->>'uau_process',''));
   if proc<>'' then
    select to_char(mh.period_start,'DD/MM/YYYY')||' a '||to_char(mh.period_end,'DD/MM/YYYY') into clash
    from public.budget_measurement_advances a join public.budget_measurements mh on mh.id=a.measurement_id
    where a.budget_id=bid and a.uau_process=proc and mh.status in ('rascunho','aprovada') and mh.id<>ident and mh.id is distinct from m.replaces_id limit 1;
    if clash is not null then raise exception 'O processo UAU % já foi lançado na medição de %',proc,clash;end if;
   end if;
   insert into public.budget_measurement_advances(measurement_id,budget_id,work_id,position,supplier,invoice,uau_process,paid_on,description,amount,source)
   values(ident,bid,b.work_id,pos,left(trim(raw.value->>'supplier'),200),left(trim(coalesce(raw.value->>'invoice','')),60),left(proc,40),
    nullif(raw.value->>'paid_on','')::date,left(trim(coalesce(raw.value->>'description','')),500),amt,
    case when raw.value->>'source'='uau' then 'uau' else 'manual' end);
  end loop;
 elsif p_action='aprovar' then
  if not can_approve or m.id is null then raise exception 'Somente coordenador de obras, diretor ou administrador pode aprovar';end if;
  if b.status<>'aprovado' or b.execution_status<>'em_execucao' then raise exception 'Orçamento não está em execução';end if;
  if m.retention_percent<>b.retention_percent then raise exception 'A retenção do contrato mudou. Salve a medição novamente antes de aprovar';end if;
  if exists(select 1 from public.budget_measurements other where other.budget_id=bid and other.status='aprovada' and other.id is distinct from m.replaces_id and other.period_start<=m.period_end and other.period_end>=m.period_start) then raise exception 'O período coincide com uma medição já aprovada';end if;
  if m.replaces_id is null and not exists(select 1 from public.budget_measurement_items where measurement_id=ident) then raise exception 'Medição sem itens';end if;
  select a.uau_process into clash from public.budget_measurement_advances a
   join public.budget_measurement_advances o on o.budget_id=a.budget_id and o.uau_process=a.uau_process and o.measurement_id<>a.measurement_id
   join public.budget_measurements mh on mh.id=o.measurement_id
   where a.measurement_id=ident and a.uau_process<>'' and mh.status='aprovada' and mh.id is distinct from m.replaces_id limit 1;
  if clash is not null then raise exception 'O processo UAU % já foi descontado em outra medição aprovada',clash;end if;
  for raw in select * from public.budget_measurement_items where measurement_id=ident loop
   select * into it from public.budget_items where id=raw.budget_item_id for update;
   if it.quantity_pending or it.unit_price_pending or it.unit_price<>raw.unit_price or it.planned_quantity<>raw.planned_quantity then raise exception 'O orçamento mudou. Revise a medição antes de aprovar';end if;
   select coalesce(sum(mi.quantity),0) into used from public.budget_measurement_items mi join public.budget_measurements mh on mh.id=mi.measurement_id where mi.budget_item_id=it.id and mh.status='aprovada' and mh.id is distinct from m.replaces_id;
   if used+raw.quantity>it.planned_quantity then raise exception 'A quantidade do item % excede o saldo orçado',it.code;end if;
  end loop;
  if m.replaces_id is not null then
   update public.budget_measurements set status='substituida' where id=m.replaces_id and budget_id=bid and status='aprovada';
   if not found then raise exception 'A medição original já foi substituída. Atualize o histórico';end if;
  end if;
  update public.budget_measurements set status='aprovada',approved_by=u,approved_at=now(),revision=revision+1 where id=ident;
 elsif p_action='cancelar' then
  if m.id is null then raise exception 'Medição não encontrada';end if;
  update public.budget_measurements set status='cancelada',revision=revision+1 where id=ident;
 else raise exception 'Ação inválida';
 end if;
 return ident;
end $$;
