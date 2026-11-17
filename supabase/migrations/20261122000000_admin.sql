-- Panel de administración de la plataforma (dueño de VitalIA).
-- Solo el service role lee estas tablas, la vista y las métricas: el servidor valida al admin (con 2FA) antes de usarlas.
-- Privacidad: el admin ve datos de cuenta y conteos, nunca datos de pacientes (VitalIA es encargado).

create table platform_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
alter table platform_admins enable row level security;

-- Bitácora inmutable de acciones del admin (sin FK para conservar el historial si se borra un consultorio)
create table admin_actions (
  id bigint generated always as identity primary key,
  admin_id uuid,
  clinic_id uuid,
  action text not null,
  reason text not null check (char_length(reason) between 3 and 500),
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);
create index admin_actions_clinic on admin_actions (clinic_id, at desc);
alter table admin_actions enable row level security;
create function admin_actions_immutable() returns trigger language plpgsql as $$
begin raise exception 'La bitácora de administración no se puede modificar'; end $$;
create trigger admin_actions_immutable before update or delete on admin_actions
  for each row execute function admin_actions_immutable();

-- Ajustes generales de la plataforma (una fila)
create table platform_settings (
  id int primary key default 1 check (id = 1),
  default_trial_days int not null default 14 check (default_trial_days between 1 and 90),
  announcement text check (announcement is null or char_length(announcement) <= 300),
  announcement_tone text not null default 'info' check (announcement_tone in ('info', 'warn')),
  usd_mxn numeric(8, 2) not null default 18.50 check (usd_mxn > 0),   -- para estimar el costo de IA en pesos
  updated_at timestamptz not null default now()
);
insert into platform_settings default values;
alter table platform_settings enable row level security;
-- El aviso global lo leen los nutriólogos; solo el servidor escribe
create policy platform_settings_read on platform_settings for select to authenticated using (true);

alter table clinics
  add column comp_until timestamptz,                                   -- cortesía: activa sin cobro hasta esta fecha
  add column ai_budget_override_usd numeric check (ai_budget_override_usd is null or ai_budget_override_usd >= 0);
alter table plans add column active boolean not null default true;

-- Tope de IA: el del plan, salvo que el admin le asigne otro al consultorio
CREATE OR REPLACE FUNCTION public.ai_reserve(p_user uuid, p_role user_role, p_model text, p_est_cost numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s ai_settings;
  cid uuid := clinic_of_user(p_user);
  month_start timestamptz := date_trunc('month', now());
  budget numeric;
  spent numeric;
  limit_usd numeric;
  per_min int;
  today_msgs int;
  month_tokens int;
  uid uuid;
begin
  if cid is null then return jsonb_build_object('ok', false, 'reason', 'disabled'); end if;
  if not clinic_is_active(cid) then return jsonb_build_object('ok', false, 'reason', 'plan'); end if;
  select * into s from ai_settings where clinic_id = cid;
  if not found or not s.enabled then return jsonb_build_object('ok', false, 'reason', 'disabled'); end if;
  -- El consultorio puede bajar su presupuesto, pero no pasar del incluido en su plan
  select least(s.monthly_budget_usd, coalesce(c.ai_budget_override_usd, p.ai_budget_usd)) into budget
  from clinics c join plans p on p.code = c.plan where c.id = cid;

  perform pg_advisory_xact_lock(hashtext('ai_budget:' || cid::text));

  select count(*) into per_min from ai_usage where user_id = p_user and created_at > now() - interval '1 minute';
  if per_min >= s.per_minute_limit then return jsonb_build_object('ok', false, 'reason', 'rate'); end if;

  if p_role = 'paciente' then
    select count(*) into today_msgs
    from ai_usage where user_id = p_user and created_at >= date_trunc('day', now());
    if today_msgs >= s.patient_daily_messages then return jsonb_build_object('ok', false, 'reason', 'daily'); end if;
    select coalesce(sum(input_tokens + output_tokens), 0) into month_tokens
    from ai_usage where user_id = p_user and created_at >= month_start;
    if month_tokens >= s.patient_monthly_tokens then return jsonb_build_object('ok', false, 'reason', 'tokens'); end if;
  end if;

  select coalesce(sum(cost_usd), 0) into spent from ai_usage where clinic_id = cid and created_at >= month_start;
  limit_usd := case when p_role = 'paciente' then budget * (1 - s.pro_reserve_pct / 100) else budget end;
  if spent + p_est_cost > limit_usd then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'spent', spent, 'budget', budget);
  end if;

  insert into ai_usage (user_id, role, model, cost_usd, clinic_id) values (p_user, p_role, p_model, p_est_cost, cid)
  returning id into uid;
  return jsonb_build_object('ok', true, 'usage_id', uid, 'spent', spent + p_est_cost, 'budget', budget);
end $function$;

-- Una fila por consultorio, sin datos de pacientes (solo conteos)
create view admin_clinics as
select
  c.id, c.name, c.plan, p.name as plan_name, p.price_mxn, p.ai_budget_usd, c.ai_budget_override_usd,
  c.status, c.trial_ends_at, c.current_period_end, c.cancel_at_period_end, c.comp_until,
  (c.status = 'activa' and c.comp_until is not null and c.comp_until > now() and c.stripe_subscription_id is null) as in_comp,
  c.stripe_subscription_id is not null as paying, c.stripe_customer_id, c.payment_failed_at, c.created_at,
  c.owner_id, u.email as owner_email, pr.full_name as owner_name, u.last_sign_in_at, u.email_confirmed_at,
  (select count(*) from patients pt where pt.clinic_id = c.id and pt.active) as active_patients,
  (select count(*) from patients pt where pt.clinic_id = c.id) as total_patients,
  (select count(*) from profiles s where s.clinic_id = c.id and s.role = 'nutriologo') as staff_count,
  (select coalesce(sum(a.cost_usd), 0) from ai_usage a
    where a.clinic_id = c.id and a.created_at >= date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City') as ai_cost_month,
  (select coalesce(sum(b.amount_mxn), 0) from billing_invoices b where b.clinic_id = c.id) as revenue_total,
  exists (select 1 from billing_profiles bp where bp.clinic_id = c.id) as has_fiscal,
  (select count(*) from arco_requests r where r.clinic_id = c.id and r.status in ('recibida', 'en_proceso') and r.due_at < now()) as arco_overdue
from clinics c
join plans p on p.code = c.plan
left join auth.users u on u.id = c.owner_id
left join profiles pr on pr.id = c.owner_id;
revoke all on admin_clinics from public, anon, authenticated;
grant select on admin_clinics to service_role;

create function admin_metrics() returns jsonb
language sql stable security definer set search_path = public as $$
  with tz as (
    select date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City' as m0
  ), s as (select * from platform_settings where id = 1)
  select jsonb_build_object(
    'mrr', (select coalesce(sum(p.price_mxn), 0) from clinics c join plans p on p.code = c.plan
            where c.status = 'activa' and c.stripe_subscription_id is not null and not c.cancel_at_period_end),
    'revenue_month', (select coalesce(sum(amount_mxn), 0) from billing_invoices, tz where paid_at >= tz.m0),
    'revenue_prev_month', (select coalesce(sum(amount_mxn), 0) from billing_invoices, tz where paid_at >= tz.m0 - interval '1 month' and paid_at < tz.m0),
    'revenue_total', (select coalesce(sum(amount_mxn), 0) from billing_invoices),
    'revenue_12m', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'total',
                      (select coalesce(sum(amount_mxn), 0) from billing_invoices b where b.paid_at >= m and b.paid_at < m + interval '1 month')) order by m)
                    from tz, generate_series(tz.m0 - interval '11 months', tz.m0, interval '1 month') m),
    'signups_12w', (select jsonb_agg(jsonb_build_object('week', to_char(w, 'YYYY-MM-DD'), 'count',
                      (select count(*) from clinics c where c.created_at >= w and c.created_at < w + interval '7 days')) order by w)
                    from generate_series(date_trunc('week', now()) - interval '11 weeks', date_trunc('week', now()), interval '7 days') w),
    'clinics', (select jsonb_build_object(
        'total', count(*),
        'trial', count(*) filter (where status = 'prueba' and trial_ends_at > now()),
        'paying', count(*) filter (where status = 'activa' and stripe_subscription_id is not null),
        'comp', count(*) filter (where status = 'activa' and stripe_subscription_id is null and comp_until > now()),
        'manual', count(*) filter (where status = 'activa' and stripe_subscription_id is null and (comp_until is null or comp_until <= now())),
        'expired', count(*) filter (where status = 'vencida' or (status = 'prueba' and trial_ends_at <= now())),
        'cancelled', count(*) filter (where status = 'cancelada'),
        'cancelling', count(*) filter (where status = 'activa' and cancel_at_period_end)
      ) from clinics),
    'conversion', (select case when count(*) = 0 then null
                     else round(100.0 * count(*) filter (where exists (select 1 from billing_invoices b where b.clinic_id = c.id)) / count(*), 1) end
                   from clinics c, s where c.created_at < now() - make_interval(days => s.default_trial_days)),
    'ai_cost_month_usd', (select coalesce(sum(cost_usd), 0) from ai_usage, tz where created_at >= tz.m0),
    'usd_mxn', (select usd_mxn from s),
    'active_patients', (select count(*) from patients where active),
    'trials_ending_7d', (select count(*) from clinics where status = 'prueba' and trial_ends_at > now() and trial_ends_at <= now() + interval '7 days'),
    'payment_failed', (select count(*) from clinics where payment_failed_at is not null),
    'cfdi_problems', (select count(*) from billing_invoices where cfdi_status in ('error', 'sin_datos')),
    'arco_overdue', (select count(*) from arco_requests where status in ('recibida', 'en_proceso') and due_at < now())
  )
$$;
revoke all on function admin_metrics() from public, anon, authenticated;
grant execute on function admin_metrics() to service_role;
