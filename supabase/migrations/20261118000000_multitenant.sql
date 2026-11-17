-- Varios consultorios en la misma plataforma, con planes por número de pacientes activos.
-- Cada dato pertenece a un consultorio: directamente (clinic_id) o a través de su paciente.
-- Un nutriólogo solo ve y modifica lo de su consultorio; un paciente, lo suyo y los catálogos de su consultorio.

-- ============ 1. Planes y consultorios ============
create table plans (
  code text primary key,
  name text not null,
  max_patients int check (max_patients > 0),         -- null = sin límite
  price_mxn numeric(10, 2),                           -- null = precio por definir
  ai_budget_usd numeric not null default 5,           -- tope mensual de IA incluido en el plan
  sort int not null default 0
);
insert into plans (code, name, max_patients, price_mxn, ai_budget_usd, sort) values
  ('p5', 'Inicio', 5, null, 3, 1),
  ('p10', 'Crecimiento', 10, null, 5, 2),
  ('p20', 'Profesional', 20, null, 10, 3),
  ('pmax', 'Ilimitado', null, null, 20, 4);

create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id uuid references auth.users on delete set null,
  plan text not null default 'p5' references plans,
  status text not null default 'prueba' check (status in ('prueba', 'activa', 'vencida', 'cancelada')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,                     -- null con estado 'activa' = sin vencimiento
  created_at timestamptz not null default now()
);

alter table profiles add column clinic_id uuid references clinics on delete set null;
alter table patients add column clinic_id uuid references clinics on delete cascade;

-- ============ 2. Helpers de autorización ============
create function clinic_of_user(p_user uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case when p.role = 'nutriologo' then p.clinic_id
              else (select pt.clinic_id from patients pt where pt.user_id = p.id) end
  from profiles p where p.id = p_user;
$$;
revoke all on function clinic_of_user(uuid) from public, anon, authenticated;

create function current_clinic_id() returns uuid
language sql stable security definer set search_path = public as $$
  select clinic_of_user(auth.uid());
$$;

-- ¿El usuario es nutriólogo del consultorio de este paciente?
create function staff_of_patient(p_patient uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from patients pt join profiles pr on pr.clinic_id = pt.clinic_id
    where pt.id = p_patient and pr.id = auth.uid() and pr.role = 'nutriologo');
$$;

create function staff_of_consultation(p_consultation uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select staff_of_patient((select patient_id from consultations where id = p_consultation));
$$;

create function safe_uuid(t text) returns uuid language sql immutable as $$
  select case when t ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then t::uuid end;
$$;

-- Suscripción vigente: en prueba sin vencer, o activa dentro de su periodo
create function clinic_is_active(p_clinic uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from clinics where id = p_clinic and (
      (status = 'activa' and (current_period_end is null or current_period_end > now()))
      or (status = 'prueba' and trial_ends_at > now())));
$$;
revoke all on function clinic_is_active(uuid) from public, anon;

-- ============ 3. clinic_id en las tablas del consultorio ============
do $$
declare t text;
begin
  foreach t in array array[
    'availability', 'plan_templates', 'macro_presets', 'meal_presets', 'custom_formulas', 'custom_factors', 'custom_fields',
    'soap_templates', 'education_materials', 'equivalent_groups', 'foods', 'recipes', 'supplements', 'exercises', 'routines',
    'reference_tables', 'audit_log', 'ai_usage', 'ai_messages', 'ai_cache', 'appointments', 'clinic_settings', 'ai_settings'
  ] loop
    execute format('alter table %I add column clinic_id uuid references clinics on delete cascade', t);
  end loop;
end $$;

-- Grupos de equivalentes: cada consultorio tiene su copia (puede ajustar aportes). clinic_id nulo = plantilla.
alter table foods drop constraint foods_group_code_fkey;
alter table equivalent_groups drop constraint equivalent_groups_pkey;
alter table equivalent_groups add column id uuid not null default gen_random_uuid() primary key;
create unique index equivalent_groups_clinic_code on equivalent_groups (clinic_id, code) nulls not distinct;

alter table custom_fields drop constraint custom_fields_key_key;

-- ============ 4. Datos existentes → primer consultorio ============
do $$
declare c uuid; owner uuid; cname text; t text;
begin
  select id into owner from profiles where role = 'nutriologo' order by created_at limit 1;
  if owner is null and not exists (select 1 from patients) then
    -- Base nueva: los catálogos sembrados quedan como base compartida o plantilla
    delete from clinic_settings;
    delete from ai_settings;
    return;
  end if;
  select name into cname from clinic_settings limit 1;
  insert into clinics (name, owner_id, plan, status) values (coalesce(cname, 'Consultorio de Nutrición'), owner, 'pmax', 'activa')
  returning id into c;
  update profiles set clinic_id = c where role = 'nutriologo';
  update patients set clinic_id = c;
  foreach t in array array[
    'availability', 'plan_templates', 'macro_presets', 'meal_presets', 'custom_formulas', 'custom_factors', 'custom_fields',
    'soap_templates', 'education_materials', 'equivalent_groups', 'audit_log', 'ai_usage', 'ai_messages', 'ai_cache',
    'appointments', 'clinic_settings', 'ai_settings'
  ] loop
    execute format('update %I set clinic_id = $1', t) using c;
  end loop;
  -- Catálogos: lo propio va al consultorio; el catálogo base queda compartido
  foreach t in array array['foods', 'recipes', 'supplements', 'exercises', 'routines'] loop
    execute format('update %I set clinic_id = $1 where not is_base', t) using c;
  end loop;
  -- Plantilla de grupos para consultorios nuevos, con el aporte original
  insert into equivalent_groups (clinic_id, code, name, subgroup, kcal, protein_g, fat_g, carbs_g, sort, family, is_custom, base_values)
  select null, code, name, subgroup,
         coalesce((base_values ->> 'kcal')::numeric, kcal), coalesce((base_values ->> 'protein_g')::numeric, protein_g),
         coalesce((base_values ->> 'fat_g')::numeric, fat_g), coalesce((base_values ->> 'carbs_g')::numeric, carbs_g),
         sort, family, false, base_values
  from equivalent_groups where clinic_id = c and not is_custom;
end $$;

-- Configuración: una fila por consultorio
alter table clinic_settings drop column id;
alter table clinic_settings add primary key (clinic_id);
alter table ai_settings drop column id;
alter table ai_settings add primary key (clinic_id);

alter table patients alter column clinic_id set not null;
alter table custom_fields add constraint custom_fields_clinic_key unique (clinic_id, key);
do $$
declare t text;
begin
  foreach t in array array['plan_templates', 'macro_presets', 'meal_presets', 'custom_formulas', 'custom_factors', 'custom_fields', 'soap_templates', 'appointments'] loop
    execute format('alter table %I alter column clinic_id set not null', t);
  end loop;
  -- Lo que crea un usuario queda en su consultorio sin que la app tenga que indicarlo
  foreach t in array array[
    'patients', 'availability', 'plan_templates', 'macro_presets', 'meal_presets', 'custom_formulas', 'custom_factors', 'custom_fields',
    'soap_templates', 'education_materials', 'equivalent_groups', 'foods', 'recipes', 'supplements', 'exercises', 'routines',
    'reference_tables', 'clinic_settings', 'ai_settings'
  ] loop
    execute format('alter table %I alter column clinic_id set default current_clinic_id()', t);
    execute format('create index on %I (clinic_id)', t);
  end loop;
end $$;

-- ============ 5. Citas: el traslape se valida por consultorio ============
create function set_appointment_clinic() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.clinic_id := (select clinic_id from patients where id = new.patient_id);
  return new;
end $$;
create trigger set_clinic before insert or update of patient_id on appointments
  for each row execute function set_appointment_clinic();
revoke all on function set_appointment_clinic() from public, anon, authenticated;

alter table appointments drop constraint appointments_tstzrange_excl;
alter table appointments add constraint appointments_no_overlap
  exclude using gist (clinic_id with =, tstzrange(starts_at, ends_at) with &&) where (status <> 'cancelada');

create or replace function busy_slots(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select starts_at, ends_at from appointments
  where clinic_id = current_clinic_id() and status <> 'cancelada' and starts_at < p_to and ends_at > p_from;
$$;

create or replace function mark_thread_read(p_patient uuid) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now()
  where patient_id = p_patient and read_at is null and sender_id <> auth.uid()
    and (staff_of_patient(p_patient) or p_patient = current_patient_id());
$$;

-- ============ 6. Bitácora e IA por consultorio ============
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor_id, action, table_name, record_id, clinic_id)
  values (auth.uid(), tg_op, tg_table_name,
          (case when tg_op = 'DELETE' then old.id else new.id end)::text, current_clinic_id());
  return null;
end $$;

create function set_ai_clinic() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.clinic_id := coalesce(new.clinic_id, clinic_of_user(new.user_id));
  return new;
end $$;
create trigger set_clinic before insert on ai_usage for each row execute function set_ai_clinic();
create trigger set_clinic before insert on ai_messages for each row execute function set_ai_clinic();
create trigger set_clinic before insert on ai_cache for each row execute function set_ai_clinic();
revoke all on function set_ai_clinic() from public, anon, authenticated;
create index on ai_usage (clinic_id, created_at);

-- Presupuesto, cuotas y vigencia del plan, por consultorio
create or replace function ai_reserve(p_user uuid, p_role user_role, p_model text, p_est_cost numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  select least(s.monthly_budget_usd, p.ai_budget_usd) into budget
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
end $$;
revoke execute on function ai_reserve from public, anon, authenticated;

-- ============ 7. Límite de pacientes activos según el plan ============
create function enforce_patient_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare lim int; n int;
begin
  if not new.active then return new; end if;
  if tg_op = 'UPDATE' and old.active and old.clinic_id = new.clinic_id then return new; end if;
  if not clinic_is_active(new.clinic_id) then raise exception 'PLAN_INACTIVO'; end if;
  select p.max_patients into lim from clinics c join plans p on p.code = c.plan where c.id = new.clinic_id;
  if lim is null then return new; end if;
  perform pg_advisory_xact_lock(hashtext('patients:' || new.clinic_id::text));
  select count(*) into n from patients where clinic_id = new.clinic_id and active and id <> new.id;
  if n >= lim then raise exception 'PLAN_LIMITE:%', lim; end if;
  return new;
end $$;
create trigger patient_limit before insert or update of active, clinic_id on patients
  for each row execute function enforce_patient_limit();
revoke all on function enforce_patient_limit() from public, anon, authenticated;

-- ============ 8. Alta de consultorio y cambio de plan ============
-- Crea el consultorio de un nutriólogo con su configuración, su copia de los grupos de equivalentes y las plantillas
-- de horario y material educativo. Solo el servidor (service role).
create function create_clinic(p_owner uuid, p_name text, p_owner_name text, p_plan text default 'p5',
                              p_trial_days int default 14, p_status text default 'prueba') returns uuid
language plpgsql security definer set search_path = public as $$
declare c uuid; mail text;
begin
  if exists (select 1 from profiles where id = p_owner and clinic_id is not null) then
    raise exception 'El usuario ya pertenece a un consultorio';
  end if;
  select email into mail from auth.users where id = p_owner;
  if mail is null then raise exception 'Usuario no encontrado'; end if;
  insert into clinics (name, owner_id, plan, status, trial_ends_at)
  values (p_name, p_owner, p_plan, p_status, case when p_status = 'prueba' then now() + make_interval(days => p_trial_days) end)
  returning id into c;
  insert into profiles (id, role, full_name, clinic_id) values (p_owner, 'nutriologo', p_owner_name, c)
  on conflict (id) do update set role = 'nutriologo', clinic_id = c, full_name = coalesce(excluded.full_name, profiles.full_name);
  insert into clinic_settings (clinic_id, name, nutritionist_name, email) values (c, p_name, p_owner_name, mail);
  insert into ai_settings (clinic_id) values (c);
  insert into equivalent_groups (clinic_id, code, name, subgroup, kcal, protein_g, fat_g, carbs_g, sort, family, is_custom, base_values)
  select c, code, name, subgroup, kcal, protein_g, fat_g, carbs_g, sort, family, false,
         coalesce(base_values, jsonb_build_object('kcal', kcal, 'protein_g', protein_g, 'fat_g', fat_g, 'carbs_g', carbs_g))
  from equivalent_groups where clinic_id is null;
  insert into availability (clinic_id, weekday, start_time, end_time, slot_minutes)
  select c, weekday, start_time, end_time, slot_minutes from availability where clinic_id is null;
  insert into education_materials (clinic_id, title, category, description, body, url, published)
  select c, title, category, description, body, url, published from education_materials where clinic_id is null and file_path is null;
  return c;
end $$;
revoke all on function create_clinic(uuid, text, text, text, int, text) from public, anon, authenticated;

-- El dueño elige plan mientras está en prueba (después del cobro, lo cambia la plataforma).
create function choose_plan(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clinics; lim int; n int;
begin
  select * into c from clinics where id = current_clinic_id() and owner_id = auth.uid();
  if not found then return jsonb_build_object('ok', false, 'reason', 'owner'); end if;
  if c.status <> 'prueba' or c.trial_ends_at <= now() then return jsonb_build_object('ok', false, 'reason', 'billing'); end if;
  select max_patients into lim from plans where code = p_code;
  if not found then return jsonb_build_object('ok', false, 'reason', 'plan'); end if;
  select count(*) into n from patients where clinic_id = c.id and active;
  if lim is not null and n > lim then return jsonb_build_object('ok', false, 'reason', 'patients', 'active', n, 'max', lim); end if;
  update clinics set plan = p_code where id = c.id;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function choose_plan(text) from public, anon;
grant execute on function choose_plan(text) to authenticated;

-- ============ 9. RLS por consultorio ============
alter table plans enable row level security;
alter table clinics enable row level security;
create policy plans_read on plans for select to authenticated using (true);
create policy own_clinic on clinics for select to authenticated using (id = current_clinic_id());

drop policy own_profile on profiles;
create policy own_profile on profiles for select to authenticated
  using (id = auth.uid() or (is_staff() and clinic_id = current_clinic_id()));

drop policy staff_all on patients;
create policy staff_all on patients for all to authenticated
  using (is_staff() and clinic_id = current_clinic_id()) with check (is_staff() and clinic_id = current_clinic_id());

do $$
declare t text;
begin
  -- Datos de un paciente: solo el nutriólogo de su consultorio
  foreach t in array array[
    'consultations', 'quick_notes', 'anthropometry', 'meal_plans', 'patient_supplements', 'patient_routines', 'recalls_24h',
    'progress_logs', 'appointments', 'messages', 'attachments', 'daily_logs', 'meal_photos', 'lab_results', 'payments', 'meal_checks'
  ] loop
    execute format('drop policy staff_all on %I', t);
    execute format('create policy staff_all on %I for all to authenticated using (staff_of_patient(patient_id)) with check (staff_of_patient(patient_id))', t);
  end loop;
  foreach t in array array['pes_diagnoses', 'consultation_addenda'] loop
    execute format('drop policy staff_all on %I', t);
    execute format('create policy staff_all on %I for all to authenticated using (staff_of_consultation(consultation_id)) with check (staff_of_consultation(consultation_id))', t);
  end loop;
  -- Configuración y catálogos propios del consultorio
  foreach t in array array[
    'availability', 'plan_templates', 'macro_presets', 'meal_presets', 'custom_formulas', 'custom_factors', 'custom_fields',
    'soap_templates', 'education_materials', 'equivalent_groups', 'clinic_settings',
    'foods', 'recipes', 'supplements', 'exercises', 'routines', 'reference_tables'
  ] loop
    execute format('drop policy staff_all on %I', t);
    execute format('create policy staff_all on %I for all to authenticated using (is_staff() and clinic_id = current_clinic_id()) with check (is_staff() and clinic_id = current_clinic_id())', t);
  end loop;
  -- Lectura del paciente (y del nutriólogo): solo lo de su consultorio
  foreach t in array array['equivalent_groups', 'clinic_settings', 'availability'] loop
    execute format('drop policy auth_read on %I', t);
    execute format('create policy clinic_read on %I for select to authenticated using (clinic_id = current_clinic_id())', t);
  end loop;
  -- Catálogo base compartido + lo propio del consultorio
  foreach t in array array['foods', 'recipes', 'supplements', 'exercises', 'routines', 'reference_tables'] loop
    execute format('drop policy auth_read on %I', t);
    execute format('create policy shared_read on %I for select to authenticated using (clinic_id is null or clinic_id = current_clinic_id())', t);
  end loop;
end $$;

drop policy published_read on education_materials;
create policy published_read on education_materials for select to authenticated
  using (published and clinic_id = current_clinic_id());

drop policy staff_read on audit_log;
create policy staff_read on audit_log for select to authenticated using (is_staff() and clinic_id = current_clinic_id());
drop policy staff_read on ai_usage;
create policy staff_read on ai_usage for select to authenticated using (is_staff() and clinic_id = current_clinic_id());
drop policy staff_read on ai_messages;
create policy staff_read on ai_messages for select to authenticated using (is_staff() and clinic_id = current_clinic_id());
drop policy staff_read on ai_settings;
create policy staff_read on ai_settings for select to authenticated using (is_staff() and clinic_id = current_clinic_id());
drop policy staff_update on ai_settings;
create policy staff_update on ai_settings for update to authenticated
  using (is_staff() and clinic_id = current_clinic_id()) with check (is_staff() and clinic_id = current_clinic_id());
drop policy staff_read on reminder_prefs;
create policy staff_read on reminder_prefs for select to authenticated using (staff_of_patient(patient_id));

-- ============ 10. Archivos por consultorio ============
-- patient-files/<patient_id>/…  ·  education|clinic|recipes/<clinic_id>/…
drop policy staff_all_files on storage.objects;
create policy staff_patient_files on storage.objects for all to authenticated
  using (bucket_id = 'patient-files' and public.staff_of_patient(public.safe_uuid((storage.foldername(name))[1])))
  with check (bucket_id = 'patient-files' and public.staff_of_patient(public.safe_uuid((storage.foldername(name))[1])));

drop policy recipes_staff_write on storage.objects;
create policy staff_clinic_files on storage.objects for all to authenticated
  using (bucket_id in ('education', 'clinic', 'recipes') and public.is_staff()
         and (storage.foldername(name))[1] = public.current_clinic_id()::text)
  with check (bucket_id in ('education', 'clinic', 'recipes') and public.is_staff()
              and (storage.foldername(name))[1] = public.current_clinic_id()::text);

-- Lectura por referencia: el archivo se ve si lo cita una fila que el usuario puede ver (RLS de esa tabla).
-- Cubre también los archivos anteriores a esta migración, que no llevan el consultorio en la ruta.
drop policy recipes_read on storage.objects;
create policy recipes_read on storage.objects for select to authenticated
  using (bucket_id = 'recipes' and exists (select 1 from public.recipes r where r.image_path = storage.objects.name));
drop policy clinic_read on storage.objects;
create policy clinic_read on storage.objects for select to authenticated
  using (bucket_id = 'clinic' and exists (select 1 from public.clinic_settings c where c.logo_path = storage.objects.name));
create policy staff_education_read on storage.objects for select to authenticated
  using (bucket_id = 'education' and public.is_staff()
         and exists (select 1 from public.education_materials m where m.file_path = storage.objects.name));
-- El nutriólogo puede borrar los archivos antiguos que cita su propio consultorio
create policy staff_legacy_delete on storage.objects for delete to authenticated
  using (public.is_staff() and (
    (bucket_id = 'education' and exists (select 1 from public.education_materials m where m.file_path = storage.objects.name))
    or (bucket_id = 'recipes' and exists (select 1 from public.recipes r where r.image_path = storage.objects.name and r.clinic_id is not null))));
