-- Resumo do dia para a coordenação pelo Telegram às 18:00 (Brasília), de segunda a sábado:
-- situação do diário de cada obra em execução e as ocorrências registradas no dia.
create table public.telegram_summaries_sent (
 day date primary key,
 sent_at timestamptz not null default now()
);
alter table public.telegram_summaries_sent enable row level security;
revoke all on public.telegram_summaries_sent from public,anon,authenticated;
grant all on public.telegram_summaries_sent to service_role;

create function public.telegram_coordination_summary(p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date; recipients jsonb; works jsonb;
begin
 if p_key is null or p_key is distinct from (select decrypted_secret from vault.decrypted_secrets where name='telegram_reminder_key') then raise exception 'Não autorizado';end if;
 insert into public.telegram_summaries_sent(day) values(today) on conflict do nothing;
 if not found then return jsonb_build_object('date',to_char(today,'DD/MM/YYYY'),'recipients','[]'::jsonb,'works','[]'::jsonb);end if;
 select coalesce(jsonb_agg(a.telegram_user_id),'[]') into recipients
 from public.telegram_accounts a join public.app_profiles p on p.user_id=a.user_id
 where p.active and p.role in ('administrador','diretor','coordenador_obras');
 select coalesce(jsonb_agg(x order by x->>'work'),'[]') into works from (
  select jsonb_build_object('work',w.name,
   'status',case when exists(select 1 from public.daily_reports d where d.work_id=w.id and d.date=today and d.status='finalizado') then 'finalizado'
                 when exists(select 1 from public.daily_reports d where d.work_id=w.id and d.date=today) then 'rascunho' else 'sem_diario' end,
   'workers',(select max(d.workers_quantity) from public.daily_reports d where d.work_id=w.id and d.date=today),
   'photos',(select count(*) from public.photos ph join public.daily_reports d on d.id=ph.daily_report_id where d.work_id=w.id and d.date=today),
   'issues',(select coalesce(jsonb_agg(left(i.description,300) order by i.created_at),'[]') from (select i.* from public.issues i join public.daily_reports d on d.id=i.daily_report_id where d.work_id=w.id and d.date=today order by i.created_at limit 5) i)) x
  from public.works w
  where w.status<>'concluida' and exists(select 1 from public.budgets b where b.work_id=w.id and b.status='aprovado' and b.execution_status='em_execucao')
 ) s;
 return jsonb_build_object('date',to_char(today,'DD/MM/YYYY'),'recipients',recipients,'works',works);
end $$;
revoke all on function public.telegram_coordination_summary(text) from public,anon,authenticated;
grant execute on function public.telegram_coordination_summary(text) to service_role;

-- 21:00 UTC = 18:00 em Brasília, segunda a sábado.
select cron.schedule('telegram-coordination-summary','0 21 * * 1-6',$job$
 select net.http_post(
  url:='https://slwxkviezhqpnbmmyezp.supabase.co/functions/v1/telegram-bot',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('action','summary','key',(select decrypted_secret from vault.decrypted_secrets where name='telegram_reminder_key')),
  timeout_milliseconds:=20000)
$job$);
