-- Tarjetas de cálculo del asistente: el resultado exacto de cada herramienta se guarda con la respuesta
-- para volver a mostrarlo al abrir el chat.
alter table ai_messages add column cards jsonb check (cards is null or pg_column_size(cards) <= 60000);
