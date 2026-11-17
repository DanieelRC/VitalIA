-- Copiloto de consulta: cada expediente tiene su propio hilo con el asistente del nutriólogo.
-- patient_id nulo = asistente general. Los pacientes no leen esta tabla (solo staff_read).
alter table ai_messages add column patient_id uuid references patients on delete cascade;
create index on ai_messages (user_id, patient_id, created_at);
