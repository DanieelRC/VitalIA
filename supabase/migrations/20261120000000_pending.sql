-- Pendientes de cumplimiento: días inhábiles oficiales en plazos ARCO y cancelación de suscripción.

-- Días de descanso obligatorio (Ley Federal del Trabajo, art. 74)
create function mx_holiday(d date) returns boolean
language sql immutable as $$
  select
    (extract(month from d) = 1 and extract(day from d) = 1)
    or (extract(month from d) = 2 and extract(isodow from d) = 1 and extract(day from d) <= 7)          -- 1er lunes de febrero
    or (extract(month from d) = 3 and extract(isodow from d) = 1 and extract(day from d) between 15 and 21) -- 3er lunes de marzo
    or (extract(month from d) = 5 and extract(day from d) = 1)
    or (extract(month from d) = 9 and extract(day from d) = 16)
    or (extract(month from d) = 10 and extract(day from d) = 1 and (extract(year from d)::int - 2024) % 6 = 0) -- cambio de Ejecutivo
    or (extract(month from d) = 11 and extract(isodow from d) = 1 and extract(day from d) between 15 and 21) -- 3er lunes de noviembre
    or (extract(month from d) = 12 and extract(day from d) = 25);
$$;

create or replace function add_business_days(p_from timestamptz, p_days int) returns timestamptz
language plpgsql immutable as $$
declare d timestamptz := p_from; n int := 0;
begin
  while n < p_days loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 and not mx_holiday((d at time zone 'America/Mexico_City')::date) then n := n + 1; end if;
  end loop;
  return d;
end $$;

-- Verificación en dos pasos: si un nutriólogo la activó, sus permisos de personal exigen una sesión verificada (aal2),
-- aunque alguien use su contraseña directamente contra la API.
create function mfa_ok() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified');
$$;
revoke all on function mfa_ok() from public, anon;
grant execute on function mfa_ok() to authenticated;

create or replace function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'nutriologo') and mfa_ok();
$$;

create or replace function staff_of_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patients pt join profiles pr on pr.clinic_id = pt.clinic_id
    where pt.id = p_patient and pr.id = auth.uid() and pr.role = 'nutriologo') and mfa_ok();
$$;

-- Cancelación por el titular: el acceso sigue hasta el fin del periodo pagado (o de la prueba)
alter table clinics add column cancel_at_period_end boolean not null default false;
alter table clinics add column renewal_notice_for timestamptz;   -- periodo cuyo aviso de renovación ya se envió

create function set_cancel(p_cancel boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clinics;
begin
  select * into c from clinics where id = current_clinic_id() and owner_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'owner'); end if;
  if c.status in ('vencida', 'cancelada') then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  update clinics set cancel_at_period_end = p_cancel where id = c.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function set_cancel(boolean) from public, anon;
grant execute on function set_cancel(boolean) to authenticated;

-- Cierre de periodos (lo llama el cron diario): lo cancelado termina, lo vencido se marca
create function close_clinic_periods() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update clinics set status = case when cancel_at_period_end then 'cancelada' else 'vencida' end
  where (status = 'prueba' and trial_ends_at <= now())
     or (status = 'activa' and current_period_end is not null and current_period_end <= now());
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function close_clinic_periods() from public, anon, authenticated;
