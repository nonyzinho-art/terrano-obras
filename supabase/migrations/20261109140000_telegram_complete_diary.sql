-- Telegram: completar o diário pelo bot (clima, efetivo, equipamentos, ocorrências, finalizar)
-- e continuar o rascunho de hoje em vez de abrir outro.
alter table public.telegram_conversations
 add column awaiting text check(awaiting in ('weather','workers','equipment','issue','finalize'));

-- Uma nova escolha de obra/orçamento sempre limpa a pergunta pendente.
create or replace function public.telegram_budget_choose(p_telegram bigint, p_user uuid, p_stage text, p_options jsonb, p_work uuid, p_budget uuid, p_update bigint)
 returns boolean language plpgsql set search_path to '' as $$
begin
 if p_stage not in ('choose_work','choose_budget','observation','done') then raise exception 'Etapa inválida';end if;
 if not exists(select 1 from public.telegram_accounts where telegram_user_id=p_telegram and user_id=p_user) then raise exception 'Conta não vinculada';end if;
 if p_stage in ('choose_budget','observation') and not exists(select 1 from public.works w where w.id=p_work and w.status<>'concluida' and private.allowed_work(p_user,w.id,true)) then raise exception 'Obra indisponível';end if;
 if p_stage='observation' and not exists(select 1 from public.budgets b where b.id=p_budget and b.work_id=p_work and b.status='aprovado' and b.execution_status='em_execucao') then raise exception 'Orçamento indisponível';end if;
 insert into public.telegram_conversations(telegram_user_id,user_id,stage,options,work_id,budget_id,front_id,last_update,selection_update,expires_at)
 values(p_telegram,p_user,p_stage,p_options,p_work,p_budget,null,p_update,p_update,now()+interval '20 minutes')
 on conflict(telegram_user_id) do update set user_id=excluded.user_id,stage=excluded.stage,options=excluded.options,work_id=excluded.work_id,budget_id=excluded.budget_id,front_id=null,last_update=excluded.last_update,selection_update=excluded.selection_update,expires_at=excluded.expires_at,report_id=null,awaiting=null
 where public.telegram_conversations.last_update<excluded.last_update;
 return found;
end $$;

create function private.telegram_diary_summary(p_report uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',r.id,'status',r.status,'weather',r.weather,'workers',r.workers_quantity,
  'equipment',to_jsonb(r.equipment),'equipment_quantity',r.equipment_quantity,
  'has_observations',trim(coalesce(r.observations,''))<>'',
  'photos',(select count(*) from public.photos p where p.daily_report_id=r.id),
  'issues',(select count(*) from public.issues i where i.daily_report_id=r.id),
  'items',(select count(*) from public.daily_report_items x where x.daily_report_id=r.id))
 from public.daily_reports r where r.id=p_report
$$;
revoke all on function private.telegram_diary_summary(uuid) from public,anon,authenticated;
grant execute on function private.telegram_diary_summary(uuid) to service_role;

-- Conversa válida e no envio do diário; trava a linha.
create function private.telegram_diary_conversation(p_telegram bigint) returns public.telegram_conversations language plpgsql set search_path='' as $$
declare c public.telegram_conversations; u uuid;
begin
 select * into c from public.telegram_conversations where telegram_user_id=p_telegram for update;
 select user_id into u from public.telegram_accounts where telegram_user_id=p_telegram;
 if c.user_id is distinct from u or u is null or c.stage<>'observation' or c.expires_at<now() or c.budget_id is null then raise exception 'Inicie novamente com /diario';end if;
 if not exists(select 1 from public.budgets b join public.works w on w.id=b.work_id where b.id=c.budget_id and b.work_id=c.work_id and b.status='aprovado' and b.execution_status='em_execucao' and w.status<>'concluida' and private.allowed_work(u,w.id,true)) then raise exception 'Orçamento indisponível';end if;
 return c;
end $$;
revoke all on function private.telegram_diary_conversation(bigint) from public,anon,authenticated;
grant execute on function private.telegram_diary_conversation(bigint) to service_role;

-- Retoma o rascunho de hoje do mesmo orçamento (se houver) ao entrar no envio.
create function public.telegram_diary_resume(p_telegram bigint) returns jsonb language plpgsql set search_path='' as $$
declare c public.telegram_conversations; r uuid;
begin
 c:=private.telegram_diary_conversation(p_telegram);
 r:=c.report_id;
 if r is null then
  select d.id into r from public.daily_reports d where d.created_by=c.user_id and d.work_id=c.work_id and d.budget_id=c.budget_id
   and d.status='rascunho' and d.date=(now() at time zone 'America/Sao_Paulo')::date order by d.updated_at desc limit 1;
  if r is null then return null;end if;
  update public.telegram_conversations set report_id=r where telegram_user_id=p_telegram;
 end if;
 return private.telegram_diary_summary(r);
end $$;

-- Marca qual resposta o bot espera (clima, efetivo...). null limpa.
create function public.telegram_diary_await(p_telegram bigint, p_update bigint, p_field text) returns boolean language plpgsql set search_path='' as $$
declare c public.telegram_conversations;
begin
 c:=private.telegram_diary_conversation(p_telegram);
 if p_update<=c.last_update then return false;end if;
 update public.telegram_conversations set awaiting=p_field,last_update=p_update,expires_at=now()+interval '20 minutes' where telegram_user_id=p_telegram;
 return true;
end $$;

-- Grava um campo do diário de hoje (criando o rascunho se preciso) ou finaliza.
create function public.telegram_diary_field(p_update bigint, p_telegram bigint, p_field text, p_value jsonb) returns jsonb language plpgsql set search_path='' as $$
declare c public.telegram_conversations; r uuid; n integer; items text[]; finished boolean:=false;
begin
 c:=private.telegram_diary_conversation(p_telegram);
 select report_id into r from public.telegram_updates where update_id=p_update;
 if found then return private.telegram_diary_summary(r);end if;
 if p_field not in ('weather','workers','equipment','issue','finalize') then raise exception 'Campo inválido';end if;
 if c.report_id is null then
  if p_field='finalize' then raise exception 'Envie fotos ou informações antes de finalizar';end if;
  r:=public.telegram_draft(p_update,p_telegram,c.work_id,'');
  update public.daily_reports set budget_id=c.budget_id where id=r and budget_id is null;
 else
  r:=c.report_id;
  if not exists(select 1 from public.daily_reports where id=r and created_by=c.user_id and work_id=c.work_id and budget_id=c.budget_id and status='rascunho' and date=(now() at time zone 'America/Sao_Paulo')::date) then raise exception 'Inicie um novo diário para hoje';end if;
  insert into public.telegram_updates(update_id,report_id) values(p_update,r);
 end if;
 if p_field='weather' then
  if p_value#>>'{}' not in ('Ensolarado','Parcialmente nublado','Nublado','Chuvoso') then raise exception 'Clima inválido';end if;
  update public.daily_reports set weather=p_value#>>'{}' where id=r;
 elsif p_field='workers' then
  n:=(p_value#>>'{}')::integer;
  if n is null or n<0 or n>5000 then raise exception 'Efetivo inválido';end if;
  update public.daily_reports set workers_quantity=n where id=r;
 elsif p_field='equipment' then
  if jsonb_typeof(p_value->'items') is distinct from 'array' or jsonb_array_length(p_value->'items')>50 then raise exception 'Equipamentos inválidos';end if;
  items:=array(select trim(e) from jsonb_array_elements_text(p_value->'items') e where trim(e)<>'');
  if exists(select 1 from unnest(items) e where length(e)>120) then raise exception 'Equipamentos inválidos';end if;
  n:=(p_value->>'quantity')::integer;
  if n is null or n<0 or n>5000 then raise exception 'Equipamentos inválidos';end if;
  update public.daily_reports set equipment=items,equipment_quantity=n where id=r;
 elsif p_field='issue' then
  if length(trim(coalesce(p_value#>>'{}',''))) not between 1 and 2000 then raise exception 'Ocorrência inválida';end if;
  insert into public.issues(work_id,daily_report_id,description) values(c.work_id,r,trim(p_value#>>'{}'));
 else
  if not exists(select 1 from public.daily_report_items where daily_report_id=r)
   and not exists(select 1 from public.daily_reports where id=r and trim(coalesce(observations,''))<>'')
   and not exists(select 1 from public.photos where daily_report_id=r)
   and not exists(select 1 from public.issues where daily_report_id=r)
  then raise exception 'Registre foto, observação ou ocorrência antes de finalizar';end if;
  update public.daily_reports set status='finalizado' where id=r;
  finished:=true;
 end if;
 if finished then
  update public.telegram_conversations set stage='done',report_id=null,awaiting=null,last_update=greatest(last_update,p_update) where telegram_user_id=p_telegram;
 else
  update public.telegram_conversations set report_id=r,awaiting=null,last_update=greatest(last_update,p_update),expires_at=now()+interval '20 minutes' where telegram_user_id=p_telegram;
 end if;
 return private.telegram_diary_summary(r);
end $$;

revoke all on function public.telegram_diary_resume(bigint) from public,anon,authenticated;
revoke all on function public.telegram_diary_await(bigint,bigint,text) from public,anon,authenticated;
revoke all on function public.telegram_diary_field(bigint,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.telegram_diary_resume(bigint) to service_role;
grant execute on function public.telegram_diary_await(bigint,bigint,text) to service_role;
grant execute on function public.telegram_diary_field(bigint,bigint,text,jsonb) to service_role;
