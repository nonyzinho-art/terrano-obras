-- Pendente de publicação junto com telegram-bot-orcamentos.ts.
-- Orçamentos aprovados começam em execução; concluir preserva o histórico.
alter table public.budgets add column execution_status text not null default 'em_execucao'
 check (execution_status in ('em_execucao','concluido'));
alter table public.budgets add constraint budgets_id_work_unique unique(id,work_id);
alter table public.daily_reports add column budget_id uuid;
alter table public.daily_reports add constraint report_budget_work_fk foreign key(budget_id,work_id) references public.budgets(id,work_id);
alter table public.telegram_conversations add column budget_id uuid;
alter table public.telegram_conversations add constraint conversation_budget_work_fk foreign key(budget_id,work_id) references public.budgets(id,work_id);
alter table public.photos add column budget_id uuid;
alter table public.photos add constraint photo_budget_work_fk foreign key(budget_id,work_id) references public.budgets(id,work_id);
alter table public.daily_reports add constraint report_id_work_budget_unique unique(id,work_id,budget_id);
alter table public.photos add constraint photo_report_budget_fk foreign key(daily_report_id,work_id,budget_id) references public.daily_reports(id,work_id,budget_id);
create index daily_reports_budget_idx on public.daily_reports(budget_id);
create index photos_budget_idx on public.photos(budget_id);
alter table public.telegram_conversations drop constraint telegram_conversations_stage_check;
alter table public.telegram_conversations add constraint telegram_conversations_stage_check check(stage in ('choose_work','choose_front','choose_budget','observation','done'));

create function public.telegram_budgets(p_telegram bigint,p_work uuid)
returns table(id uuid,name text) language plpgsql security invoker set search_path='' as $$
declare u uuid;
begin
 select user_id into u from public.telegram_accounts where telegram_user_id=p_telegram;
 if u is null or not exists(select 1 from public.works w where w.id=p_work and w.status<>'concluida' and private.allowed_work(u,w.id,true)) then raise exception 'Obra indisponível';end if;
 return query select b.id,b.name from public.budgets b where b.work_id=p_work and b.status='aprovado' and b.execution_status='em_execucao' order by b.name,b.id;
end $$;

create function public.telegram_budget_choose(p_telegram bigint,p_user uuid,p_stage text,p_options jsonb,p_work uuid,p_budget uuid,p_update bigint)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 if p_stage not in ('choose_work','choose_budget','observation','done') then raise exception 'Etapa inválida';end if;
 if not exists(select 1 from public.telegram_accounts where telegram_user_id=p_telegram and user_id=p_user) then raise exception 'Conta não vinculada';end if;
 if p_stage in ('choose_budget','observation') and not exists(select 1 from public.works w where w.id=p_work and w.status<>'concluida' and private.allowed_work(p_user,w.id,true)) then raise exception 'Obra indisponível';end if;
 if p_stage='observation' and not exists(select 1 from public.budgets b where b.id=p_budget and b.work_id=p_work and b.status='aprovado' and b.execution_status='em_execucao') then raise exception 'Orçamento indisponível';end if;
 insert into public.telegram_conversations(telegram_user_id,user_id,stage,options,work_id,budget_id,front_id,last_update,selection_update,expires_at)
 values(p_telegram,p_user,p_stage,p_options,p_work,p_budget,null,p_update,p_update,now()+interval '20 minutes')
 on conflict(telegram_user_id) do update set user_id=excluded.user_id,stage=excluded.stage,options=excluded.options,work_id=excluded.work_id,budget_id=excluded.budget_id,front_id=null,last_update=excluded.last_update,selection_update=excluded.selection_update,expires_at=excluded.expires_at,report_id=null
 where public.telegram_conversations.last_update<excluded.last_update;
 return found;
end $$;

create function public.telegram_diary_append_budget(p_update bigint,p_telegram bigint,p_text text,p_path text,p_work uuid,p_budget uuid)
returns uuid language plpgsql security invoker set search_path='' as $$
declare c public.telegram_conversations%rowtype; r uuid;
begin
 select * into c from public.telegram_conversations where telegram_user_id=p_telegram for update;
 if not found or p_update<=c.selection_update or c.work_id is distinct from p_work or c.budget_id is distinct from p_budget or p_budget is null then raise exception 'Seleção mudou. Inicie novamente';end if;
 perform 1 from public.budgets b join public.works w on w.id=b.work_id where b.id=p_budget and b.work_id=p_work and b.status='aprovado' and b.execution_status='em_execucao' and w.status<>'concluida' for share of b,w;
 if not found then raise exception 'Orçamento indisponível';end if;
 if c.report_id is not null and not exists(select 1 from public.daily_reports where id=c.report_id and budget_id=p_budget and date=(now() at time zone 'America/Sao_Paulo')::date) then raise exception 'Inicie um novo diário para hoje';end if;
 select report_id into r from public.telegram_updates where update_id=p_update;
 if found then
  if not exists(select 1 from public.daily_reports where id=r and work_id=p_work and budget_id=p_budget and created_by=c.user_id) then raise exception 'Envio pertence a outro diário';end if;
  return r;
 end if;
 r:=public.telegram_diary_append(p_update,p_telegram,p_text,p_path);
 update public.daily_reports set budget_id=p_budget where id=r and work_id=p_work and (budget_id is null or budget_id=p_budget);
 if not found then raise exception 'Orçamento do diário inválido';end if;
 if p_path is not null then update public.photos set budget_id=p_budget where daily_report_id=r and work_id=p_work and storage_path=p_path;end if;
 return r;
end $$;
revoke all on function public.telegram_budgets(bigint,uuid),public.telegram_budget_choose(bigint,uuid,text,jsonb,uuid,uuid,bigint),public.telegram_diary_append_budget(bigint,bigint,text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.telegram_budgets(bigint,uuid),public.telegram_budget_choose(bigint,uuid,text,jsonb,uuid,uuid,bigint),public.telegram_diary_append_budget(bigint,bigint,text,text,uuid,uuid) to service_role;
