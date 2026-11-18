-- Correcciones de la auditoría del 2026-11-17 (AUDIT/REPORTE.md, hallazgos C1 y C2).

-- ============ C1. Las vistas del paciente son de solo lectura ============
-- Son vistas simples (auto-actualizables) que corren con los privilegios de su dueño: con permiso de escritura,
-- un paciente podía modificar o borrar sus mediciones y R24h de consulta, editar su expediente, crear expedientes
-- e insertar mediciones en el expediente de otro paciente sin pasar por RLS.
revoke insert, update, delete, truncate, references, trigger
  on my_patient, my_anthropometry, my_recalls from public, anon, authenticated;
grant select on my_patient, my_anthropometry, my_recalls to authenticated;
-- Evita que filtros de la consulta se evalúen antes que el de la vista (fuga por funciones con efectos)
alter view my_patient set (security_barrier = true);
alter view my_anthropometry set (security_barrier = true);
alter view my_recalls set (security_barrier = true);

-- ============ C2. El correo y la cuenta de un expediente activado no se cambian desde el cliente ============
-- Con el correo de un expediente se generan enlaces de acceso: si el consultorio pudiera cambiarlo (o la cuenta
-- vinculada) después de la activación, podría apuntar el enlace a la cuenta de otra persona.
-- El servidor (service role, sin auth.uid()) sí puede hacerlo, p. ej. al atender una rectificación ARCO.
create function guard_patient_identity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'La cuenta vinculada al expediente no se puede cambiar' using errcode = '42501';
  end if;
  if old.user_id is not null and lower(new.email) <> lower(old.email) then
    raise exception 'El paciente ya activó su cuenta: su correo no se puede cambiar desde aquí' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger guard_patient_identity before update of email, user_id on patients
  for each row execute function guard_patient_identity();
revoke all on function guard_patient_identity() from public, anon, authenticated;
