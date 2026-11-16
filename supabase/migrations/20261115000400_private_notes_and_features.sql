-- ============ A. El paciente no puede leer notas clínicas por ningún medio ============
-- Antes podía leer por API filas completas de su expediente, sus mediciones y sus recordatorios (con las notas
-- del nutriólogo). Ahora solo accede a vistas que exponen columnas seguras.

-- Expediente general: sin antecedentes, medicamentos, historia dietética ni estilo de vida
drop policy patient_self on patients;
create view my_patient as
  select id, user_id, full_name, email, birth_date, sex, goal, pathologies, allergies, privacy_accepted_at
  from patients where user_id = auth.uid();

-- Mediciones en consulta: sin notas, pliegues ni diámetros
drop policy patient_read on anthropometry;
create view my_anthropometry as
  select id, patient_id, measured_at, weight_kg, height_cm, circumferences, results
  from anthropometry where patient_id = current_patient_id();

-- Recordatorios de 24 h: el paciente ve los suyos completos; de los capturados en consulta, nunca las notas
drop policy patient_read on recalls_24h;
create policy patient_read_own on recalls_24h for select to authenticated
  using (patient_id = current_patient_id() and captured_by = 'paciente');
create view my_recalls as
  select id, patient_id, recall_date, captured_by, items, totals,
         case when captured_by = 'paciente' then notes end as notes, created_at
  from recalls_24h where patient_id = current_patient_id();

revoke all on my_patient, my_anthropometry, my_recalls from anon, public;
grant select on my_patient, my_anthropometry, my_recalls to authenticated;

-- ============ B. Tablas de las funcionalidades nuevas ============

-- Mi día: hidratación y síntomas
create table daily_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  day date not null default current_date,
  water_glasses int not null default 0 check (water_glasses between 0 and 30),
  satiety int check (satiety between 1 and 5),
  digestion int check (digestion between 1 and 5),
  energy int check (energy between 1 and 5),
  created_at timestamptz not null default now(),
  unique (patient_id, day)
);

-- Registro de comida con foto y comentario del nutriólogo
create table meal_photos (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  path text not null unique,
  meal text not null check (char_length(meal) <= 60),
  note text check (note is null or char_length(note) <= 500),
  eaten_at timestamptz not null default now(),
  comment text check (comment is null or char_length(comment) <= 1000),
  commented_at timestamptz,
  created_at timestamptz not null default now()
);
create index on meal_photos (patient_id, eaten_at desc);

-- Recordatorios push
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  patient_id uuid not null references patients on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 300),
  auth text not null check (char_length(auth) <= 100),
  created_at timestamptz not null default now()
);
create table reminder_prefs (
  patient_id uuid primary key references patients on delete cascade,
  meals jsonb not null default '[]' check (pg_column_size(meals) <= 2000), -- [{label, time: "HH:MM"}]
  water boolean not null default false,
  weigh_day int check (weigh_day between 0 and 6),                          -- 0 = domingo
  updated_at timestamptz not null default now()
);
create table push_log (
  patient_id uuid not null references patients on delete cascade,
  key text not null,
  sent_at timestamptz not null default now(),
  primary key (patient_id, key)
);

-- Laboratorios
create table lab_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  taken_on date not null default current_date,
  values jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
create index on lab_results (patient_id, taken_on desc);

-- Plantillas de plan
create table plan_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  description text,
  kcal_target numeric not null,
  energy jsonb not null default '{}',
  macros jsonb not null default '{}',
  meals jsonb not null default '[]',
  menu jsonb not null default '[]',
  recommendations text,
  created_at timestamptz not null default now()
);

-- Pagos y paquetes
create table payments (
  id uuid primary key default gen_random_uuid(),
  folio bigint generated always as identity,
  patient_id uuid not null references patients on delete cascade,
  paid_on date not null default current_date,
  kind text not null default 'consulta' check (kind in ('consulta', 'paquete', 'otro')),
  concept text not null check (char_length(concept) between 1 and 200),
  amount numeric(10, 2) not null check (amount >= 0 and amount <= 1000000),
  method text not null default 'efectivo' check (method in ('efectivo', 'transferencia', 'tarjeta', 'paquete')),
  sessions int check (sessions between 1 and 100), -- sesiones que incluye un paquete
  notes text,
  created_at timestamptz not null default now()
);
create index on payments (patient_id, paid_on desc);
create index on payments (paid_on);

-- ============ C. Permisos ============
do $$
declare t text;
begin
  foreach t in array array['daily_logs','meal_photos','push_subscriptions','reminder_prefs','push_log','lab_results','plan_templates','payments'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
  -- El nutriólogo administra todo menos las suscripciones push y su bitácora (solo servidor)
  foreach t in array array['daily_logs','meal_photos','lab_results','plan_templates','payments'] loop
    execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;
create policy staff_read on reminder_prefs for select to authenticated using (is_staff());
revoke all on push_log from anon, authenticated;

-- Paciente: su día
create policy patient_read on daily_logs for select to authenticated using (patient_id = current_patient_id());
create policy patient_insert on daily_logs for insert to authenticated with check (patient_id = current_patient_id());
create policy patient_update on daily_logs for update to authenticated
  using (patient_id = current_patient_id()) with check (patient_id = current_patient_id());

-- Paciente: sus fotos de comida. Lee el comentario del nutriólogo (es para él), pero no puede escribirlo.
create policy patient_read on meal_photos for select to authenticated using (patient_id = current_patient_id());
create policy patient_insert on meal_photos for insert to authenticated
  with check (patient_id = current_patient_id() and comment is null and commented_at is null
              and split_part(path, '/', 1) = current_patient_id()::text);
create policy patient_delete on meal_photos for delete to authenticated using (patient_id = current_patient_id());

create policy patient_meal_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'patient-files'
         and (storage.foldername(name))[1] = current_patient_id()::text
         and exists (select 1 from public.meal_photos m where m.path = storage.objects.name));
create policy patient_own_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'patient-files'
         and (storage.foldername(name))[1] = current_patient_id()::text
         and exists (select 1 from public.meal_photos m where m.path = storage.objects.name));

-- Paciente: sus recordatorios
create policy own_subscription on push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and patient_id = current_patient_id());
create policy patient_read on reminder_prefs for select to authenticated using (patient_id = current_patient_id());
create policy patient_insert on reminder_prefs for insert to authenticated with check (patient_id = current_patient_id());
create policy patient_update on reminder_prefs for update to authenticated
  using (patient_id = current_patient_id()) with check (patient_id = current_patient_id());

-- Límite de volumen también para las fotos de comida y las suscripciones
create or replace function guard_patient_volume() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; lim int; win interval;
begin
  if auth.uid() is null or is_staff() then return new; end if;
  case tg_table_name
    when 'messages' then lim := 60; win := interval '1 hour';
    when 'progress_logs' then lim := 10; win := interval '1 day';
    when 'recalls_24h' then lim := 5; win := interval '1 day';
    when 'attachments' then lim := 20; win := interval '1 day';
    when 'meal_photos' then lim := 12; win := interval '1 day';
    when 'push_subscriptions' then lim := 10; win := interval '30 days';
  end case;
  execute format('select count(*) from %I where patient_id = $1 and created_at > now() - $2', tg_table_name)
    into n using new.patient_id, win;
  if n >= lim then raise exception 'Límite alcanzado, intenta más tarde'; end if;
  return new;
end $$;
create trigger guard_volume before insert on meal_photos for each row execute function guard_patient_volume();
create trigger guard_volume before insert on push_subscriptions for each row execute function guard_patient_volume();

-- El paciente no puede cambiar el comentario del nutriólogo (no tiene política de UPDATE en meal_photos)
create trigger audit_payments after insert or update or delete on payments for each row execute function audit_trigger();
create trigger audit_labs after insert or update or delete on lab_results for each row execute function audit_trigger();
