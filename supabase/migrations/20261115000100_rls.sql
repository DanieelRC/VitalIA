-- Row Level Security: el nutriólogo ve todo; el paciente solo lo suyo y nunca notas clínicas.

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','patients','clinic_settings','consultations','pes_diagnoses','consultation_addenda',
    'quick_notes','audit_log','anthropometry','equivalent_groups','foods','recipes','supplements',
    'exercises','routines','meal_plans','patient_supplements','patient_routines','recalls_24h',
    'progress_logs','availability','appointments','messages','attachments','education_materials',
    'reference_tables','ai_settings','ai_usage','ai_messages'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Acceso total del nutriólogo (excepto bitácora e IA, que son de solo lectura vía cliente)
do $$
declare t text;
begin
  foreach t in array array[
    'patients','clinic_settings','consultations','pes_diagnoses','consultation_addenda','quick_notes',
    'anthropometry','equivalent_groups','foods','recipes','supplements','exercises','routines',
    'meal_plans','patient_supplements','patient_routines','recalls_24h','progress_logs','availability',
    'appointments','messages','attachments','education_materials','reference_tables'
  ] loop
    execute format('create policy staff_all on %I for all to authenticated using (is_staff()) with check (is_staff())', t);
  end loop;
end $$;

create policy staff_read on audit_log for select to authenticated using (is_staff());
create policy staff_read on ai_usage for select to authenticated using (is_staff());
create policy staff_read on ai_messages for select to authenticated using (is_staff());
create policy staff_read on ai_settings for select to authenticated using (is_staff());
create policy staff_update on ai_settings for update to authenticated using (is_staff()) with check (is_staff());

-- Perfiles
create policy own_profile on profiles for select to authenticated using (id = auth.uid() or is_staff());
-- El rol jamás se edita desde el cliente
revoke update, insert, delete on profiles from anon, authenticated;

-- Paciente: su propio expediente general
create policy patient_self on patients for select to authenticated using (user_id = auth.uid());

create function accept_privacy() returns void
language sql security definer set search_path = public as $$
  update patients set privacy_accepted_at = now() where user_id = auth.uid() and privacy_accepted_at is null;
$$;

-- Catálogos: lectura para cualquier usuario autenticado
do $$
declare t text;
begin
  foreach t in array array['equivalent_groups','foods','recipes','supplements','exercises','routines',
                           'reference_tables','clinic_settings','availability'] loop
    execute format('create policy auth_read on %I for select to authenticated using (true)', t);
  end loop;
end $$;
create policy published_read on education_materials for select to authenticated using (published);

-- Lectura propia del paciente
create policy patient_read on anthropometry for select to authenticated using (patient_id = current_patient_id());
create policy patient_read on meal_plans for select to authenticated
  using (patient_id = current_patient_id() and status = 'activo');
create policy patient_read on patient_supplements for select to authenticated
  using (patient_id = current_patient_id() and active);
create policy patient_read on patient_routines for select to authenticated
  using (patient_id = current_patient_id() and active);

-- R24h y progreso: el paciente registra lo suyo
create policy patient_read on recalls_24h for select to authenticated using (patient_id = current_patient_id());
create policy patient_insert on recalls_24h for insert to authenticated
  with check (patient_id = current_patient_id() and captured_by = 'paciente');
create policy patient_delete on recalls_24h for delete to authenticated
  using (patient_id = current_patient_id() and captured_by = 'paciente');

create policy patient_read on progress_logs for select to authenticated using (patient_id = current_patient_id());
create policy patient_insert on progress_logs for insert to authenticated with check (patient_id = current_patient_id());
create policy patient_delete on progress_logs for delete to authenticated using (patient_id = current_patient_id());

-- Citas
create policy patient_read on appointments for select to authenticated using (patient_id = current_patient_id());
create policy patient_insert on appointments for insert to authenticated
  with check (patient_id = current_patient_id() and status = 'solicitada' and starts_at > now());

create function cancel_my_appointment(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update appointments set status = 'cancelada'
  where id = p_id and patient_id = current_patient_id() and starts_at > now() and status in ('solicitada', 'confirmada');
$$;

-- Horarios ocupados (sin datos de otros pacientes) para que el paciente elija
create function busy_slots(p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select starts_at, ends_at from appointments
  where status <> 'cancelada' and starts_at < p_to and ends_at > p_from;
$$;

-- Mensajes
create policy patient_read on messages for select to authenticated using (patient_id = current_patient_id());
create policy patient_insert on messages for insert to authenticated
  with check (patient_id = current_patient_id() and sender_id = auth.uid());

create function mark_thread_read(p_patient uuid) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now()
  where patient_id = p_patient and read_at is null and sender_id <> auth.uid()
    and (is_staff() or p_patient = current_patient_id());
$$;

-- Archivos
create policy patient_read on attachments for select to authenticated
  using (patient_id = current_patient_id() and visible_to_patient);
create policy patient_insert on attachments for insert to authenticated
  with check (patient_id = current_patient_id() and uploaded_by = auth.uid() and visible_to_patient);

-- ============ Storage ============
insert into storage.buckets (id, name, public, file_size_limit)
values ('patient-files', 'patient-files', false, 10485760),
       ('education', 'education', false, 20971520),
       ('clinic', 'clinic', false, 2097152)
on conflict (id) do nothing;

create policy staff_all_files on storage.objects for all to authenticated
  using (bucket_id in ('patient-files', 'education', 'clinic') and is_staff())
  with check (bucket_id in ('patient-files', 'education', 'clinic') and is_staff());

-- Ruta: patient-files/<patient_id>/<archivo>
create policy patient_own_files_read on storage.objects for select to authenticated
  using (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = current_patient_id()::text
    and exists (select 1 from public.attachments a
                where a.path = storage.objects.name and a.visible_to_patient)
  );
create policy patient_own_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'patient-files' and (storage.foldername(name))[1] = current_patient_id()::text);

create policy education_read on storage.objects for select to authenticated
  using (bucket_id = 'education');
create policy clinic_read on storage.objects for select to authenticated
  using (bucket_id = 'clinic');
