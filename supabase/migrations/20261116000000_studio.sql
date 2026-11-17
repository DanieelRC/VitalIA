-- Estudio de distribución, personalización del consultorio y seguimiento diario del plan.

-- ============ Personalización (solo nutriólogo) ============
-- Distribuciones de macronutrientes propias
create table macro_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  protein_pct numeric not null check (protein_pct between 0 and 100),
  fat_pct numeric not null check (fat_pct between 0 and 100),
  carbs_pct numeric not null check (carbs_pct between 0 and 100),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);

-- Distribuciones por tiempos de comida propias
create table meal_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  meals jsonb not null check (jsonb_typeof(meals) = 'array' and pg_column_size(meals) <= 4000), -- [{name, kcal_pct}]
  created_at timestamptz not null default now()
);

-- Fórmulas propias de gasto energético basal. La expresión la evalúa un intérprete seguro en la app (sin eval).
create table custom_formulas (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  expression text not null check (char_length(expression) between 1 and 300),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);

-- Factores de actividad y de estrés propios
create table custom_factors (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('actividad', 'estres')),
  label text not null check (char_length(label) between 1 and 80),
  value numeric not null check (value between 0.5 and 3),
  created_at timestamptz not null default now()
);

-- Campos propios en la historia clínica
create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 80),
  kind text not null default 'texto' check (kind in ('texto', 'numero', 'si_no', 'lista')),
  options text[] not null default '{}',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table patients add column custom jsonb not null default '{}' check (pg_column_size(custom) <= 16000);
alter table patients add column target_weight_kg numeric(6, 2) check (target_weight_kg between 2 and 500);

-- Plantillas de nota SOAP
create table soap_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  reason text, subjective text, objective text, assessment text, plan text,
  created_at timestamptz not null default now()
);

-- Documentos: color, pie y secciones del PDF del plan
alter table clinic_settings add column pdf_accent text not null default '#177a47' check (pdf_accent ~ '^#[0-9a-fA-F]{6}$');
alter table clinic_settings add column pdf_footer text check (pdf_footer is null or char_length(pdf_footer) <= 200);
alter table clinic_settings add column pdf_sections jsonb not null default '{"equivalentes": true, "menu": true, "recomendaciones": true, "intercambios": true}';

-- Grupos de equivalentes: el nutriólogo puede ajustar su aporte y crear grupos propios.
-- `family` decide el color (verduras, frutas, cereales, leguminosas, aoa, leche, grasas, azucares, libres).
alter table equivalent_groups add column family text check (family in ('verduras', 'frutas', 'cereales', 'leguminosas', 'aoa', 'leche', 'grasas', 'azucares', 'libres'));
alter table equivalent_groups add column is_custom boolean not null default false;
alter table equivalent_groups add column base_values jsonb; -- aporte original, para poder restablecerlo
alter table equivalent_groups add constraint equivalent_groups_ranges check (kcal between 0 and 1000 and protein_g between 0 and 100 and fat_g between 0 and 100 and carbs_g between 0 and 200);
update equivalent_groups set base_values = jsonb_build_object('kcal', kcal, 'protein_g', protein_g, 'fat_g', fat_g, 'carbs_g', carbs_g);

-- Recetas con foto
alter table recipes add column image_path text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipes', 'recipes', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy recipes_read on storage.objects for select to authenticated using (bucket_id = 'recipes');
create policy recipes_staff_write on storage.objects for all to authenticated
  using (bucket_id = 'recipes' and is_staff()) with check (bucket_id = 'recipes' and is_staff());
-- La foto de una receta base sí se puede cambiar (no altera su contenido clínico)
create or replace function protect_base_rows() returns trigger
language plpgsql as $$
begin
  if old.is_base and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    if tg_op = 'UPDATE' and tg_table_name = 'recipes'
       and (to_jsonb(new) - 'image_path') = (to_jsonb(old) - 'image_path') then
      return new;
    end if;
    raise exception 'Los registros del catálogo base no se editan; duplícalo';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['macro_presets', 'meal_presets', 'custom_formulas', 'custom_factors', 'custom_fields', 'soap_templates'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

-- ============ Paciente: seguir el plan día a día ============
-- Comidas marcadas como hechas y platillo sustituido por el paciente para ese día
create table meal_checks (
  patient_id uuid not null references patients on delete cascade,
  day date not null,
  meal int not null check (meal between 0 and 7),
  done boolean not null default false,
  recipe_id uuid references recipes on delete set null, -- sustitución elegida por el paciente
  updated_at timestamptz not null default now(),
  primary key (patient_id, day, meal)
);
alter table meal_checks enable row level security;
create policy staff_all on meal_checks for all to authenticated using (is_staff()) with check (is_staff());
create policy patient_read on meal_checks for select to authenticated using (patient_id = current_patient_id());
create policy patient_insert on meal_checks for insert to authenticated
  with check (patient_id = current_patient_id() and day between current_date - 7 and current_date + 1);
create policy patient_update on meal_checks for update to authenticated
  using (patient_id = current_patient_id()) with check (patient_id = current_patient_id() and day between current_date - 7 and current_date + 1);

-- La vista del paciente incluye su peso meta (lo fija el nutriólogo); sigue sin exponer notas ni antecedentes.
drop view my_patient;
create view my_patient as
  select id, user_id, full_name, email, birth_date, sex, goal, pathologies, allergies, privacy_accepted_at, target_weight_kg
  from patients where user_id = auth.uid();
revoke all on my_patient from anon, public;
grant select on my_patient to authenticated;
