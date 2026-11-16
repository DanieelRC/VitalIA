-- Caché diaria de respuestas del asistente: la misma pregunta del mismo usuario, el mismo día y con el
-- mismo contexto se responde sin llamar al modelo. Solo accesible con service role (RLS sin políticas).
create table ai_cache (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  cache_key text not null,
  answer text not null,
  hits int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, cache_key)
);
create index on ai_cache (day);
alter table ai_cache enable row level security;
revoke all on ai_cache from anon, authenticated;
