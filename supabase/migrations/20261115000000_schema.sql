-- VitalIA: esquema principal
create extension if not exists btree_gist;

create type user_role as enum ('nutriologo', 'paciente');

-- ============ Usuarios ============
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  role user_role not null default 'paciente',
  full_name text,
  created_at timestamptz not null default now()
);

create table patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users on delete set null,
  full_name text not null,
  email text not null unique,
  phone text,
  birth_date date,
  sex text check (sex in ('M', 'F')),
  occupation text,
  goal text,
  pathologies text[] not null default '{}',
  allergies text[] not null default '{}',
  medications text,
  personal_history text,
  family_history text,
  gyneco_history text,
  lifestyle jsonb not null default '{}',
  diet_history text,
  active boolean not null default true,
  invited_at timestamptz,
  privacy_accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============ Helpers de autorización ============
create function is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'nutriologo');
$$;

create function current_patient_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from patients where user_id = auth.uid();
$$;

-- Nuevo usuario de Auth: crea perfil y vincula expediente por correo.
-- El rol siempre inicia como 'paciente'; los nutriólogos se promueven con el script create-admin.
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, role, full_name)
  values (new.id, 'paciente', new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  update patients set user_id = new.id
  where lower(email) = lower(new.email) and user_id is null;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ============ Configuración del consultorio ============
create table clinic_settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Consultorio de Nutrición',
  nutritionist_name text,
  license text,
  address text,
  phone text,
  email text,
  logo_path text,
  updated_at timestamptz not null default now()
);
insert into clinic_settings (id) values (1);

-- ============ Expediente (SOAP + PES) ============
create table consultations (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  consulted_at timestamptz not null default now(),
  reason text,
  subjective text,
  objective text,
  assessment text,
  plan text,
  status text not null default 'borrador' check (status in ('borrador', 'firmada')),
  signed_at timestamptz,
  signed_by uuid references auth.users,
  created_at timestamptz not null default now()
);
create index on consultations (patient_id, consulted_at desc);

create table pes_diagnoses (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations on delete cascade,
  domain text not null default 'ingestion' check (domain in ('ingestion', 'clinico', 'conductual')),
  problem text not null,
  etiology text not null,
  signs text not null,
  created_at timestamptz not null default now()
);

create table consultation_addenda (
  id uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references consultations on delete cascade,
  body text not null,
  author_id uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);

create table quick_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  consultation_id uuid references consultations on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Una nota firmada es inmutable (NOM-004): solo se agregan adendas.
create function protect_signed_consultation() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'firmada' then raise exception 'La nota firmada no puede eliminarse'; end if;
    return old;
  end if;
  if old.status = 'firmada' then raise exception 'La nota firmada no puede modificarse; agrega una adenda'; end if;
  if new.status = 'firmada' then
    new.signed_at := now();
    new.signed_by := auth.uid();
  end if;
  return new;
end $$;
create trigger consultations_protect before update or delete on consultations
for each row execute function protect_signed_consultation();

create function protect_signed_pes() returns trigger
language plpgsql as $$
declare st text;
begin
  select status into st from consultations
  where id = case when tg_op = 'DELETE' then old.consultation_id else new.consultation_id end;
  if st = 'firmada' then raise exception 'La nota está firmada'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger pes_protect before insert or update or delete on pes_diagnoses
for each row execute function protect_signed_pes();

-- ============ Bitácora ============
create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid,
  action text not null,
  table_name text not null,
  record_id text,
  at timestamptz not null default now()
);

create function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, action, table_name, record_id)
  values (auth.uid(), tg_op, tg_table_name,
          (case when tg_op = 'DELETE' then old.id else new.id end)::text);
  return null;
end $$;

-- ============ Antropometría ============
create table anthropometry (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  measured_at date not null default current_date,
  weight_kg numeric(6, 2),
  height_cm numeric(5, 1),
  circumferences jsonb not null default '{}', -- cintura, cadera, brazo, pantorrilla, muslo, cuello, muneca
  skinfolds jsonb not null default '{}',       -- mm: triceps, biceps, subescapular, suprailiaco, abdominal, muslo, pecho, axilar, pantorrilla
  diameters jsonb not null default '{}',       -- cm: humero, femur, muneca
  bia jsonb not null default '{}',             -- grasa_pct, musculo_kg, agua_pct, visceral
  results jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);
create index on anthropometry (patient_id, measured_at desc);

-- ============ Catálogos ============
create table equivalent_groups (
  code text primary key,
  name text not null,
  subgroup text,
  kcal numeric not null,
  protein_g numeric not null,
  fat_g numeric not null,
  carbs_g numeric not null,
  sort int not null default 0
);

create table foods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  group_code text references equivalent_groups,
  portion text not null,           -- "1 pieza", "1/2 taza"
  portion_g numeric,               -- peso neto de la porción
  kcal numeric not null default 0,
  protein_g numeric not null default 0,
  fat_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fiber_g numeric,
  sodium_mg numeric,
  is_base boolean not null default false,
  created_at timestamptz not null default now()
);
create index on foods (group_code);
create index foods_name_idx on foods using gin (to_tsvector('spanish', name));

create table recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  meal_time text not null default 'comida' check (meal_time in ('desayuno', 'colacion', 'comida', 'cena')),
  tags text[] not null default '{}', -- normal, diabetes, hipertension, renal, dislipidemia, celiaquia, sii, embarazo, vegetariana, alta_proteina...
  servings int not null default 1,
  prep_minutes int,
  ingredients jsonb not null default '[]', -- [{name, quantity, unit}]
  steps text[] not null default '{}',
  kcal numeric, protein_g numeric, fat_g numeric, carbs_g numeric, -- por porción
  equivalents jsonb not null default '{}', -- {group_code: n} por porción
  is_base boolean not null default false,
  created_at timestamptz not null default now()
);
create index on recipes using gin (tags);

create table supplements (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  presentation text,
  typical_dose text,
  indications text,
  contraindications text,
  interactions text,
  evidence text check (evidence in ('A', 'B', 'C')),
  notes text,
  is_base boolean not null default false,
  created_at timestamptz not null default now()
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('aerobico', 'anaerobico', 'flexibilidad')),
  muscle_group text,
  equipment text,
  met numeric,
  description text,
  video_url text,
  is_base boolean not null default false,
  created_at timestamptz not null default now()
);

create table routines (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('aerobico', 'anaerobico', 'mixto')),
  level text check (level in ('principiante', 'intermedio', 'avanzado')),
  goal text,
  notes text,
  items jsonb not null default '[]', -- [{exercise_id, name, sets, reps, rest_s, duration_min, intensity}]
  is_base boolean not null default false,
  created_at timestamptz not null default now()
);

-- Catálogo base: solo lectura (duplicar para editar)
create function protect_base_rows() returns trigger
language plpgsql as $$
begin
  if old.is_base and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    raise exception 'Los registros del catálogo base no se editan; duplícalo';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger foods_base before update or delete on foods for each row execute function protect_base_rows();
create trigger recipes_base before update or delete on recipes for each row execute function protect_base_rows();
create trigger supplements_base before update or delete on supplements for each row execute function protect_base_rows();
create trigger exercises_base before update or delete on exercises for each row execute function protect_base_rows();
create trigger routines_base before update or delete on routines for each row execute function protect_base_rows();

-- ============ Plan alimenticio ============
create table meal_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  name text not null default 'Plan de alimentación',
  status text not null default 'borrador' check (status in ('borrador', 'activo', 'archivado')),
  start_date date default current_date,
  energy jsonb not null default '{}',   -- {formula, geb, activity, stress, eta_pct, get, adjustment}
  kcal_target numeric not null,
  macros jsonb not null default '{}',   -- {mode, protein_pct, fat_pct, carbs_pct, protein_gkg, fat_gkg, protein_g, fat_g, carbs_g}
  meals jsonb not null default '[]',    -- [{name, kcal_pct, equivalents: {code: n}}]
  menu jsonb not null default '[]',     -- [{day, meal, recipe_id, text}]
  recommendations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on meal_plans (patient_id, created_at desc);
create unique index one_active_plan on meal_plans (patient_id) where status = 'activo';

create table patient_supplements (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  supplement_id uuid not null references supplements,
  dose text, schedule text, notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table patient_routines (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  routine_id uuid not null references routines,
  frequency text, notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============ Recordatorio de 24 h ============
create table recalls_24h (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  recall_date date not null default current_date,
  captured_by text not null default 'nutriologo' check (captured_by in ('nutriologo', 'paciente')),
  items jsonb not null default '[]', -- [{meal, time, place, description, food_id, quantity, kcal, protein_g, fat_g, carbs_g}]
  totals jsonb not null default '{}',
  notes text,
  created_at timestamptz not null default now()
);

-- ============ Portal del paciente ============
create table progress_logs (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  logged_at date not null default current_date,
  weight_kg numeric(6, 2),
  waist_cm numeric(5, 1),
  hip_cm numeric(5, 1),
  adherence int check (adherence between 1 and 5),
  exercise_minutes int,
  notes text,
  photo_path text,
  created_at timestamptz not null default now()
);

create table availability (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6), -- 0 = domingo
  start_time time not null,
  end_time time not null,
  slot_minutes int not null default 60
);

create table appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'solicitada' check (status in ('solicitada', 'confirmada', 'cancelada', 'completada')),
  reason text,
  reminder_sent_at timestamptz,
  created_at timestamptz not null default now(),
  exclude using gist (tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelada')
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  sender_id uuid not null references auth.users default auth.uid(),
  body text not null check (char_length(body) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on messages (patient_id, created_at);

create table attachments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients on delete cascade,
  path text not null,
  name text not null,
  mime text,
  size int,
  category text default 'otro', -- laboratorio, foto, estudio, otro
  visible_to_patient boolean not null default true,
  uploaded_by uuid references auth.users default auth.uid(),
  created_at timestamptz not null default now()
);

create table education_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  description text,
  body text,
  file_path text,
  url text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table reference_tables (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text,
  columns text[] not null,
  rows jsonb not null default '[]', -- arreglo de arreglos
  source text,
  sort int not null default 0
);

-- ============ IA: presupuesto, cuotas y auditoría ============
create table ai_settings (
  id int primary key default 1 check (id = 1),
  enabled boolean not null default true,
  monthly_budget_usd numeric not null default 10,
  pro_reserve_pct numeric not null default 20,     -- % del presupuesto reservado para el nutriólogo
  patient_daily_messages int not null default 20,
  patient_monthly_tokens int not null default 150000,
  per_minute_limit int not null default 5,
  max_input_chars int not null default 1500,
  max_output_tokens int not null default 600,
  pro_max_output_tokens int not null default 1500,
  history_turns int not null default 8,
  alert_sent_month text,
  updated_at timestamptz not null default now()
);
insert into ai_settings (id) values (1);

create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  role user_role not null,
  model text not null,
  status text not null default 'reserved' check (status in ('reserved', 'final', 'error')),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);
create index on ai_usage (created_at);
create index on ai_usage (user_id, created_at);

create table ai_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  blocked_reason text,
  created_at timestamptz not null default now()
);
create index on ai_messages (user_id, created_at);

/*
  Verifica límites y reserva costo estimado de forma atómica (lock por usuario y global).
  Devuelve {ok, reason, usage_id, spent, budget}. Solo invocable con service role.
*/
create function ai_reserve(p_user uuid, p_role user_role, p_model text, p_est_cost numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s ai_settings;
  month_start timestamptz := date_trunc('month', now());
  spent numeric;
  limit_usd numeric;
  per_min int;
  today_msgs int;
  month_tokens int;
  uid uuid;
begin
  select * into s from ai_settings where id = 1;
  if not s.enabled then return jsonb_build_object('ok', false, 'reason', 'disabled'); end if;

  perform pg_advisory_xact_lock(hashtext('ai_budget'));

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

  select coalesce(sum(cost_usd), 0) into spent from ai_usage where created_at >= month_start;
  limit_usd := case when p_role = 'paciente'
    then s.monthly_budget_usd * (1 - s.pro_reserve_pct / 100)
    else s.monthly_budget_usd end;
  if spent + p_est_cost > limit_usd then
    return jsonb_build_object('ok', false, 'reason', 'budget', 'spent', spent, 'budget', s.monthly_budget_usd);
  end if;

  insert into ai_usage (user_id, role, model, cost_usd) values (p_user, p_role, p_model, p_est_cost)
  returning id into uid;
  return jsonb_build_object('ok', true, 'usage_id', uid, 'spent', spent + p_est_cost, 'budget', s.monthly_budget_usd);
end $$;
revoke execute on function ai_reserve from public, anon, authenticated;

-- ============ Auditoría ============
create trigger audit_patients after insert or update or delete on patients for each row execute function audit_trigger();
create trigger audit_consultations after insert or update or delete on consultations for each row execute function audit_trigger();
create trigger audit_anthropometry after insert or update or delete on anthropometry for each row execute function audit_trigger();
create trigger audit_meal_plans after insert or update or delete on meal_plans for each row execute function audit_trigger();
create trigger audit_attachments after insert or update or delete on attachments for each row execute function audit_trigger();

-- ============ Realtime ============
alter publication supabase_realtime add table messages;
