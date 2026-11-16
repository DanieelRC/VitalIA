-- Endurecimiento de seguridad (auditoría 2026-11-15).
-- Todo lo que un paciente puede escribir directo contra la API (con su sesión y la llave pública) queda acotado
-- en la base, no solo en la interfaz.

-- ============ 1. Citas: duración, horizonte y cantidad ============
alter table appointments add constraint appointments_range check (ends_at > starts_at);
alter table appointments add constraint appointments_reason_len check (reason is null or char_length(reason) <= 500);

create function guard_patient_appointment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- El nutriólogo y los procesos del servidor no tienen estos límites
  if auth.uid() is null or is_staff() then return new; end if;
  if new.ends_at - new.starts_at < interval '15 minutes' or new.ends_at - new.starts_at > interval '3 hours' then
    raise exception 'Duración de cita no válida';
  end if;
  if new.starts_at > now() + interval '120 days' then
    raise exception 'Solo se pueden agendar citas dentro de los próximos 120 días';
  end if;
  if (select count(*) from appointments
      where patient_id = new.patient_id and status in ('solicitada', 'confirmada') and starts_at > now()) >= 3 then
    raise exception 'Ya tienes 3 citas próximas; cancela una para agendar otra';
  end if;
  return new;
end $$;
create trigger guard_patient_appointment before insert on appointments
  for each row execute function guard_patient_appointment();

-- ============ 2. Límites de volumen para lo que escribe el paciente ============
alter table progress_logs add constraint progress_notes_len check (notes is null or char_length(notes) <= 2000);
alter table progress_logs add constraint progress_ranges check (
  (weight_kg is null or weight_kg between 2 and 500) and (waist_cm is null or waist_cm between 20 and 300)
  and (hip_cm is null or hip_cm between 20 and 300) and (exercise_minutes is null or exercise_minutes between 0 and 1440));
alter table recalls_24h add constraint recalls_size check (pg_column_size(items) <= 65536 and (notes is null or char_length(notes) <= 4000));
alter table attachments add constraint attachments_name_len check (char_length(name) <= 200);

create function guard_patient_volume() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int; lim int; win interval;
begin
  if auth.uid() is null or is_staff() then return new; end if;
  case tg_table_name
    when 'messages' then lim := 60; win := interval '1 hour';
    when 'progress_logs' then lim := 10; win := interval '1 day';
    when 'recalls_24h' then lim := 5; win := interval '1 day';
    when 'attachments' then lim := 20; win := interval '1 day';
  end case;
  execute format('select count(*) from %I where patient_id = $1 and created_at > now() - $2', tg_table_name)
    into n using new.patient_id, win;
  if n >= lim then raise exception 'Límite alcanzado, intenta más tarde'; end if;
  return new;
end $$;
create trigger guard_volume before insert on messages for each row execute function guard_patient_volume();
create trigger guard_volume before insert on progress_logs for each row execute function guard_patient_volume();
create trigger guard_volume before insert on recalls_24h for each row execute function guard_patient_volume();
create trigger guard_volume before insert on attachments for each row execute function guard_patient_volume();

-- ============ 3. Storage: tipos permitidos, cuota por paciente y material no publicado ============
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']
  where id = 'patient-files';
update storage.buckets set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
  where id = 'education';
update storage.buckets set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'clinic';

create function patient_file_count() returns int
language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects
  where bucket_id = 'patient-files' and (storage.foldername(name))[1] = current_patient_id()::text;
$$;
revoke all on function patient_file_count() from public, anon;
grant execute on function patient_file_count() to authenticated;

drop policy patient_own_files_insert on storage.objects;
create policy patient_own_files_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = current_patient_id()::text
    and patient_file_count() < 200
  );

-- El material educativo solo se descarga si está publicado (antes: cualquier archivo del bucket)
drop policy education_read on storage.objects;
create policy education_read on storage.objects for select to authenticated
  using (bucket_id = 'education' and exists (
    select 1 from public.education_materials m where m.file_path = storage.objects.name and m.published));

-- ============ 4. Freno a fuerza bruta en el inicio de sesión ============
-- Los intentos llegan desde el servidor de la app, así que el límite por IP de Supabase Auth no distingue
-- atacantes; se limita por cuenta. Solo accesible con service role.
create table login_attempts (
  id bigint generated always as identity primary key,
  email_hash text not null,
  created_at timestamptz not null default now()
);
create index on login_attempts (email_hash, created_at);
alter table login_attempts enable row level security;
revoke all on login_attempts from anon, authenticated;

-- ============ 5. Funciones internas no invocables por clientes ============
revoke all on function guard_patient_appointment() from public, anon, authenticated;
revoke all on function guard_patient_volume() from public, anon, authenticated;
