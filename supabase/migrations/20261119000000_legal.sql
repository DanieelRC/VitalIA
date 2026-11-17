-- Cumplimiento LFPDPPP (2025): evidencia de consentimientos y solicitudes de derechos ARCO.

-- ============ Evidencia de aceptación de avisos y términos (inmutable) ============
create table legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete set null,          -- quien aceptó en línea (null si fue en papel)
  clinic_id uuid references clinics on delete cascade,
  patient_id uuid references patients on delete cascade,
  document text not null check (document in ('aviso_vitalia', 'terminos', 'aviso_paciente')),
  version text not null check (char_length(version) between 1 and 40),
  method text not null default 'electronico' check (method in ('electronico', 'papel')),
  tutor_name text check (char_length(tutor_name) <= 160),          -- consentimiento de madre, padre o tutor (menores)
  ip text check (char_length(ip) <= 80),
  user_agent text check (char_length(user_agent) <= 400),
  recorded_by uuid references auth.users on delete set null,      -- nutriólogo que registró un consentimiento en papel
  accepted_at timestamptz not null default now(),
  check (document <> 'aviso_paciente' or patient_id is not null)
);
create index on legal_acceptances (patient_id, document, accepted_at desc);
create index on legal_acceptances (clinic_id);

create function set_legal_clinic() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.patient_id is not null then
    new.clinic_id := (select clinic_id from patients where id = new.patient_id);
  end if;
  return new;
end $$;
create trigger set_clinic before insert on legal_acceptances for each row execute function set_legal_clinic();
revoke all on function set_legal_clinic() from public, anon, authenticated;

alter table legal_acceptances enable row level security;
create policy own_or_clinic_read on legal_acceptances for select to authenticated
  using (user_id = auth.uid() or (is_staff() and clinic_id = current_clinic_id()));
-- El nutriólogo solo puede dejar constancia de un consentimiento firmado en papel; lo electrónico lo escribe el servidor.
create policy staff_paper on legal_acceptances for insert to authenticated
  with check (method = 'papel' and document = 'aviso_paciente' and staff_of_patient(patient_id)
              and recorded_by = auth.uid() and user_id is null and ip is null);
-- Sin políticas de update/delete: la evidencia no se modifica.

-- ============ Solicitudes de derechos ARCO ============
-- Días hábiles (sin fines de semana; los días festivos se revisan a mano)
create function add_business_days(p_from timestamptz, p_days int) returns timestamptz
language plpgsql immutable as $$
declare d timestamptz := p_from; n int := 0;
begin
  while n < p_days loop
    d := d + interval '1 day';
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

create table arco_requests (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics on delete cascade,
  patient_id uuid not null references patients on delete cascade,
  requested_by uuid references auth.users on delete set null,
  kind text not null check (kind in ('acceso', 'rectificacion', 'cancelacion', 'oposicion', 'revocacion')),
  details text not null check (char_length(details) between 1 and 2000),
  status text not null default 'recibida' check (status in ('recibida', 'en_proceso', 'procedente', 'improcedente')),
  response text check (char_length(response) <= 4000),
  responded_at timestamptz,
  responded_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now(),
  due_at timestamptz not null                                       -- 20 días hábiles (art. 31)
);
create index on arco_requests (clinic_id, status, due_at);
create index on arco_requests (patient_id, created_at desc);

create function arco_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.clinic_id := (select clinic_id from patients where id = new.patient_id);
    new.created_at := now();
    new.due_at := add_business_days(now(), 20);
    if not is_staff() then
      new.status := 'recibida'; new.response := null; new.responded_at := null; new.responded_by := null;
    end if;
  else
    -- Lo que pidió la persona titular no cambia; solo la respuesta
    new.clinic_id := old.clinic_id; new.patient_id := old.patient_id; new.requested_by := old.requested_by;
    new.kind := old.kind; new.details := old.details; new.created_at := old.created_at; new.due_at := old.due_at;
    if new.status is distinct from old.status or new.response is distinct from old.response then
      new.responded_at := now(); new.responded_by := auth.uid();
    end if;
  end if;
  return new;
end $$;
create trigger guard before insert or update on arco_requests for each row execute function arco_guard();
revoke all on function arco_guard() from public, anon, authenticated;

alter table arco_requests enable row level security;
-- El consultorio lee y responde; no borra (la solicitud es evidencia del trámite)
create policy staff_read on arco_requests for select to authenticated using (staff_of_patient(patient_id));
create policy staff_insert on arco_requests for insert to authenticated with check (staff_of_patient(patient_id));
create policy staff_update on arco_requests for update to authenticated
  using (staff_of_patient(patient_id)) with check (staff_of_patient(patient_id));
create policy patient_read on arco_requests for select to authenticated
  using (patient_id = current_patient_id());
create policy patient_insert on arco_requests for insert to authenticated
  with check (patient_id = current_patient_id() and requested_by = auth.uid());
-- Máximo 5 solicitudes abiertas por paciente (evita saturar al consultorio)
create function arco_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff() and (select count(*) from arco_requests where patient_id = new.patient_id and status in ('recibida', 'en_proceso')) >= 5 then
    raise exception 'Tienes demasiadas solicitudes abiertas. Espera la respuesta de tu nutriólogo.';
  end if;
  return new;
end $$;
create trigger arco_limit before insert on arco_requests for each row execute function arco_limit();
revoke all on function arco_limit() from public, anon, authenticated;

create trigger audit_arco after insert or update or delete on arco_requests for each row execute function audit_trigger();
create trigger audit_legal after insert on legal_acceptances for each row execute function audit_trigger();
