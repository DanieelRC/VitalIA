-- Cobro de suscripciones con Stripe y facturación CFDI 4.0 con Facturapi.
-- Stripe es la fuente de verdad del estado de pago; el webhook (service role) sincroniza clinics.
-- Los datos fiscales los captura el titular; las facturas solo las escribe el servidor.

-- Precios provisionales, en MXN con IVA incluido (editables)
update plans set price_mxn = case code when 'p5' then 299 when 'p10' then 499 when 'p20' then 799 when 'pmax' then 1199 end;

alter table clinics
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text unique,
  add column payment_failed_at timestamptz;

-- Datos fiscales del titular para el CFDI
create table billing_profiles (
  clinic_id uuid primary key references clinics on delete cascade,
  rfc text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  legal_name text not null check (char_length(legal_name) between 1 and 300),
  tax_regime text not null check (tax_regime ~ '^6[0-9]{2}$'),
  zip text not null check (zip ~ '^[0-9]{5}$'),
  cfdi_use text not null default 'G03' check (cfdi_use in ('G03', 'S01', 'D01', 'CP01')),
  email text check (email is null or email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  updated_at timestamptz not null default now()
);

-- Pagos recibidos (uno por factura de Stripe) y su CFDI
create table billing_invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  stripe_invoice_id text not null unique,
  amount_mxn numeric(10, 2) not null,
  description text not null,
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz not null default now(),
  payment_form text not null default '04',           -- SAT: 04 tarjeta de crédito, 28 de débito
  receipt_url text,
  cfdi_id text,
  cfdi_uuid text,
  cfdi_status text not null default 'pendiente' check (cfdi_status in ('pendiente', 'timbrada', 'sin_datos', 'error', 'no_configurado')),
  cfdi_error text,
  created_at timestamptz not null default now()
);
create index billing_invoices_clinic on billing_invoices (clinic_id, paid_at desc);

-- Eventos de Stripe ya procesados (idempotencia del webhook)
create table billing_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

alter table billing_profiles enable row level security;
alter table billing_invoices enable row level security;
alter table billing_events enable row level security;

create function is_clinic_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select mfa_ok() and exists (select 1 from clinics where id = current_clinic_id() and owner_id = auth.uid())
$$;
revoke all on function is_clinic_owner() from public, anon;
grant execute on function is_clinic_owner() to authenticated;

create policy billing_profile_owner on billing_profiles for all to authenticated
  using (clinic_id = current_clinic_id() and is_clinic_owner())
  with check (clinic_id = current_clinic_id() and is_clinic_owner());

create policy billing_invoices_owner on billing_invoices for select to authenticated
  using (clinic_id = current_clinic_id() and is_clinic_owner());
-- billing_events: sin políticas (solo service role)

create function billing_profiles_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger billing_profiles_touch before update on billing_profiles
  for each row execute function billing_profiles_touch();

-- Con Stripe, el estado lo marca el webhook. El cron solo cierra suscripciones de Stripe si el webhook
-- no llegó tras 7 días de gracia (reintentos de cobro), para no cortar el acceso por un retraso.
create or replace function close_clinic_periods() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update clinics set status = case when cancel_at_period_end then 'cancelada' else 'vencida' end
  where (status = 'prueba' and trial_ends_at <= now())
     or (status = 'activa' and current_period_end is not null
         and current_period_end + case when stripe_subscription_id is null then interval '0' else interval '7 days' end <= now());
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function close_clinic_periods() from public, anon, authenticated;

-- choose_plan sigue sirviendo solo durante la prueba y sin suscripción pagada
create or replace function choose_plan(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clinics; lim int; n int;
begin
  select * into c from clinics where id = current_clinic_id() and owner_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'owner'); end if;
  if c.status <> 'prueba' or c.trial_ends_at <= now() or c.stripe_subscription_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'billing');
  end if;
  select max_patients into lim from plans where code = p_code;
  if not found then return jsonb_build_object('ok', false, 'reason', 'plan'); end if;
  select count(*) into n from patients where clinic_id = c.id and active;
  if lim is not null and n > lim then return jsonb_build_object('ok', false, 'reason', 'patients', 'active', n, 'max', lim); end if;
  update clinics set plan = p_code where id = c.id;
  return jsonb_build_object('ok', true);
end $$;
