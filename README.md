# VitalIA

Plataforma de consulta nutricional para un consultorio: portal del **nutriólogo** y del **paciente**.

**Stack:** Next.js 15 (App Router) · Supabase (Postgres + RLS, Auth, Storage, Realtime) · Tailwind 4 · AI SDK + Grok (xAI) · react-pdf · Gmail (SMTP) o Resend · PWA.

## Módulos

| Nutriólogo (`/consultorio`) | Paciente (`/portal`) |
|---|---|
| Pacientes por invitación, historia clínico-nutricional | Mi plan (equivalentes, menú, lista de intercambio, PDF) |
| Expediente **SOAP + PES**, firma inmutable y adendas (NOM-004) | Recetas por condición y modo de preparación |
| Antropometría con evaluación automática y gráficas | Rutinas y suplementos asignados |
| Plan: GEB (8 fórmulas) → GET → macros (%, g/kg, presets) → tiempos → equivalentes SMAE con adecuación → menú semanal | Registro de progreso y fotos/archivos |
| Recordatorio de 24 h con cálculo y comparación vs plan | Recordatorio de 24 h |
| Catálogos: alimentos, tabla de equivalentes, recetas, suplementos, ejercicios, rutinas | Citas (horarios libres), mensajes en tiempo real |
| Calculadora y referencia de fórmulas, tablas de referencia, material educativo | Asistente **Vita** (Grok) y material educativo |
| Agenda, mensajes, asistente clínico, ajustes y panel de consumo IA | |

### Funciones adicionales

- **Paciente:** lista del súper (del menú semanal, por grupo), intercambios guiados, "Mi día" (agua, energía, saciedad, digestión), fotos de comida con comentario del nutriólogo, recordatorios push (comidas, agua, peso, citas).
- **Nutriólogo:** resumen pre-consulta, alertas de seguimiento en el inicio, laboratorios con rangos de referencia, plantillas de plan con escalado de energía, borrador de nota SOAP con IA, pagos, paquetes y recibos en PDF.
- **Privacidad:** el paciente nunca lee notas clínicas. Solo accede a las vistas `my_patient`, `my_anthropometry` y `my_recalls`, que no exponen notas, antecedentes ni medicamentos.

Recordatorios push: genera las llaves con `npx web-push generate-vapid-keys` y ponlas en `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`. El cron `/api/cron/push` debe correr **cada 15 minutos** (en Vercel requiere plan Pro; en otro hosting, cualquier programador que llame la ruta con `Authorization: Bearer $CRON_SECRET`).

## Puesta en marcha (local)

Requisitos: Node 22+, Docker Desktop **en ejecución**.

```bash
npm install
npm run db:start          # levanta Supabase local y aplica migraciones + seed
cp .env.example .env.local # pega las llaves que imprime db:start (anon y service_role)
npm run create-admin -- tu@correo.com "Nombre Apellido" "contraseña-segura"
npm run dev
```

- Correos locales (invitaciones): Inbucket/Mailpit en http://127.0.0.1:56324
- `npm test` — fórmulas y lógica de presupuesto IA · `npm run typecheck` · `npm run build`

## Chatbot: costo y seguridad

Todo pasa por `src/app/api/chat/route.ts`; la llave de xAI solo vive en el servidor.

1. Sesión verificada → interruptor global (`ai_settings.enabled`).
2. El cliente solo envía el texto nuevo; el historial (últimos N turnos) se lee de la base.
3. Filtro de emergencias / TCA: respuesta fija sin llamar al modelo.
4. `ai_reserve()` (Postgres, con lock): límite por minuto, mensajes/día y tokens/mes por paciente, y **presupuesto mensual** reservando el costo estimado antes de llamar. Los pacientes se bloquean antes para dejar una reserva al nutriólogo.
5. `maxOutputTokens`, longitud máxima de entrada, modelo económico para pacientes.
6. Al terminar se registra el costo real; aviso por correo al 80 %.
7. El contexto del paciente se arma con RLS y sin nombre ni notas clínicas.

Configura precios en `XAI_PRICES` y **también un límite de gasto en la consola de xAI** como respaldo.

## Producción

1. Proyecto en Supabase Cloud: `npx supabase link` y `npx supabase db push`; carga `supabase/seed.sql` una vez. Desactiva *signups* y copia las plantillas de `supabase/templates` (invitación y recuperación usan `/auth/confirm?token_hash=...`).
2. Vercel: variables de `.env.example`, `CRON_SECRET` y dominio en `NEXT_PUBLIC_SITE_URL`. El cron de `vercel.json` envía recordatorios de cita.
3. SMTP propio en Supabase Auth para las invitaciones.

## Contenido clínico

El catálogo base (SMAE, ~140 alimentos, 30 recetas, 20 suplementos, 30 ejercicios, 8 rutinas, tablas de referencia) es un punto de partida **que debe revisar el nutriólogo** antes de su uso clínico. Los registros base son de solo lectura; se duplican para editarlos.
