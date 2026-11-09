-- Lembrete do diário pelo Telegram às 17:30 (horário de Brasília), de segunda a sábado.
-- Vai para quem é editor da obra ou registrou diário dela nos últimos 7 dias,
-- quando a obra ainda não tem diário finalizado no dia.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table public.telegram_reminders_sent (
 day date not null,
 telegram_user_id bigint not null references public.telegram_accounts(telegram_user_id) on delete cascade,
 sent_at timestamptz not null default now(),
 primary key(day,telegram_user_id)
);
alter table public.telegram_reminders_sent enable row level security;
revoke all on public.telegram_reminders_sent from public,anon,authenticated;
grant all on public.telegram_reminders_sent to service_role;

-- Chave do agendamento: gerada aqui, guardada no cofre e nunca sai do banco.
select vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'telegram_reminder_key','Autoriza o lembrete diário do bot');

-- Lista quem deve ser lembrado hoje e marca como enviado (uma vez por dia por pessoa).
create function public.telegram_reminder_list(p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare today date:=(now() at time zone 'America/Sao_Paulo')::date; result jsonb;
begin
 if p_key is null or p_key is distinct from (select decrypted_secret from vault.decrypted_secrets where name='telegram_reminder_key') then raise exception 'Não autorizado';end if;
 with people as (
  select distinct a.telegram_user_id, a.user_id, w.id work_id, w.name work_name
  from public.telegram_accounts a
  join public.app_profiles p on p.user_id=a.user_id and p.active
  join public.works w on w.status<>'concluida'
  where private.allowed_work(a.user_id,w.id,true)
   and exists(select 1 from public.budgets b where b.work_id=w.id and b.status='aprovado' and b.execution_status='em_execucao')
   and (exists(select 1 from public.work_members m where m.work_id=w.id and m.user_id=a.user_id and m.role='editor')
    or exists(select 1 from public.daily_reports d where d.work_id=w.id and d.created_by=a.user_id and d.date>=today-7))
 ), pending as (
  select pe.*,
   (select d.id from public.daily_reports d where d.work_id=pe.work_id and d.date=today and d.status='rascunho' order by d.updated_at desc limit 1) draft
  from people pe
  where not exists(select 1 from public.daily_reports d where d.work_id=pe.work_id and d.date=today and d.status='finalizado')
   and not exists(select 1 from public.telegram_reminders_sent s where s.day=today and s.telegram_user_id=pe.telegram_user_id)
 ), grouped as (
  select telegram_user_id, jsonb_agg(jsonb_build_object('work',work_name,'draft',draft is not null,
   'photos',(select count(*) from public.photos ph where ph.daily_report_id=draft)) order by work_name) works
  from pending group by telegram_user_id
 ), marked as (
  insert into public.telegram_reminders_sent(day,telegram_user_id) select today,telegram_user_id from grouped
  on conflict do nothing returning telegram_user_id
 )
 select coalesce(jsonb_agg(jsonb_build_object('telegram_user_id',g.telegram_user_id,'works',g.works)),'[]') into result
 from grouped g join marked mk on mk.telegram_user_id=g.telegram_user_id;
 return jsonb_build_object('date',to_char(today,'DD/MM/YYYY'),'people',result);
end $$;
revoke all on function public.telegram_reminder_list(text) from public,anon,authenticated;
grant execute on function public.telegram_reminder_list(text) to service_role;

-- 20:30 UTC = 17:30 em Brasília (sem horário de verão), segunda a sábado.
select cron.schedule('telegram-diary-reminder','30 20 * * 1-6',$job$
 select net.http_post(
  url:='https://slwxkviezhqpnbmmyezp.supabase.co/functions/v1/telegram-bot',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('action','remind','key',(select decrypted_secret from vault.decrypted_secrets where name='telegram_reminder_key')),
  timeout_milliseconds:=20000)
$job$);
