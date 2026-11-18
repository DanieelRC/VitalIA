# Auditoría VitalIA — seguridad, QA y motion

**Fecha:** 17 de noviembre de 2026 · **Commit auditado:** `104ffa8` (rama `main`, árbol limpio) · **Entorno:** Supabase local (`npm run db:start`), `next dev` en `localhost:3003`, `.env.local`.
No se modificó el código de la app. Todo lo producido está en `AUDIT/`.

| Carpeta | Contenido |
|---|---|
| `AUDIT/semgrep/` | SARIF/JSON de Semgrep (registry), reglas propias `vitalia-rules.yml` y su resultado, `npm-audit.json` |
| `AUDIT/rls/` | Estado real de RLS/vistas/grants volcado de la base (`rls_state.txt`), salida de `npm run test:rls`, sondas propias `probe.mjs` + `probe.log` |
| `AUDIT/qa/` | Scripts Playwright (`scripts/`), 41 capturas (`screens/`), `results.json`, `qa-run.log`, `console-flows.log`, `takeover-result.json`, `dev-server.log` |

---

## 1. Resumen ejecutivo

La base de seguridad de VitalIA es sólida en lo que ya prueba: RLS por consultorio, notas firmadas inmutables, presupuesto de IA atómico, validación de firma binaria en subidas, headers estrictos y `test:rls` con 85 verificaciones en verde. **Pero encontré dos fallas críticas, verificadas, que rompen el aislamiento clínico**:

1. **Las vistas `my_patient`, `my_anthropometry` y `my_recalls` aceptan escrituras y no aplican RLS.** Un paciente con su sesión y la llave pública puede alterar y borrar sus mediciones clínicas y R24h capturados en consulta, editar sus patologías y correo, crear expedientes nuevos e **insertar mediciones en el expediente de otro paciente** (de cualquier consultorio, si conoce su UUID). Viola la integridad del expediente (NOM‑004) y es justo lo que el README dice que no pasa.
2. **«Enlace de invitación» permite tomar cuentas de otros consultorios.** Si el correo ya tiene cuenta, `createInviteLink` genera un enlace de *recuperación* y se lo entrega al nutriólogo. Basta con dar de alta un «paciente» con el correo de otra nutrióloga. Lo probé de punta a punta: el enlace abre la sesión de la víctima y muestra **sus** pacientes.

Además, el **filtro de crisis de Vita deja pasar** frases como «me quiero morir» y «ya no quiero estar aquí»: llegan a Grok, que respondió con un número de crisis distinto al oficial, y el nutriólogo no recibe ninguna alerta.

QA: 68 de 73 verificaciones E2E pasan, sin errores de consola. Las 3 fallas son las de arriba. Responsive móvil sin desbordes en las 9 pantallas probadas. Motion: bien contenido, pero la entrada de página con `blur` en cada navegación, las barras con `transition: width` y huecos en `prefers-reduced-motion` (Recharts, animaciones infinitas y ligadas al scroll) merecen ajuste.

**Recomendación:** no habilitar más consultorios ni pacientes reales hasta corregir C1 y C2 (las dos son cambios pequeños) y agregar sus pruebas de regresión.

---

## 2. Tabla de hallazgos (ordenada por severidad)

Leyenda de evidencia: **V** = verificado en ejecución · **C** = confirmado leyendo el código · **S** = supuesto o inferido, sin prueba.

| ID | Sev. | Hallazgo | Archivo:línea | Evid. | OWASP 2025 · ASVS 5 |
|---|---|---|---|---|---|
| C1 | **Crítica** | Vistas `my_*` escribibles y con privilegios del dueño (saltan RLS) | `supabase/migrations/20261115000400_private_notes_and_features.sql:7,13,21`; `20261116000000_studio.sql:128` | V | A01, A08 · V8.2, V8.3 |
| C2 | **Crítica** | Toma de cuenta entre consultorios con enlace de *recovery* | `src/app/consultorio/pacientes/actions.ts:111-121` | V | A01, A07 · V6.4, V8.2 |
| A1 | **Alta** | Filtro de crisis incompleto; el modelo recibe el mensaje e inventa un número; no se avisa al nutriólogo | `src/lib/ai/guard.ts:3-8`; `src/app/api/chat/route.ts:70-81` | V | A06, A09 · V16 |
| A2 | **Alta** | Vinculación por correo al crear cualquier usuario (`handle_new_user`) | `supabase/migrations/20261115000000_schema.sql:51-60`; `src/app/(auth)/actions.ts:62` | C/S | A01, A07 · V6.3 |
| M1 | Media | Datos clínicos (medicamentos, notas rápidas, laboratorios, SOAP previo) se envían a xAI desde el copiloto y el borrador SOAP; el aviso al paciente no lo informa y ZDR no está confirmado | `src/lib/actions/soap-draft.ts:58-72`; `src/components/patient-privacy-notice.tsx:77`; `docs/legal/README.md:36` | C | A04/A06 · V14 · LFPDPPP |
| M2 | Media | Bitácora clínica incompleta: solo id/acción (sin antes/después), sin lecturas, y sin auditoría de `pes_diagnoses`, `consultation_addenda`, `quick_notes`, `recalls_24h`, `messages` | `schema.sql:163-171,511-515` | V (DB) | A09 · V16.2 · NOM‑004 |
| M3 | Media | Notas sin firmar, mediciones y laboratorios se borran físicamente (sin borrado lógico) | políticas `staff_all` (FOR ALL) | V (DB) | A08 · NOM‑004 5.4 |
| M4 | Media | Respuestas de caché y de emergencia no pasan por `ai_reserve`: escrituras ilimitadas en `ai_messages`/`ai_cache` | `src/app/api/chat/route.ts:70-81,114-126` | C | A06 · V2.4 |
| M5 | Media | Bloqueo de cuenta por terceros: 8 intentos fallidos bloquean al usuario real 15 min; con correo sin confirmar, cada intento manda un enlace | `src/app/(auth)/actions.ts:16-31` | C | A07 · V6.3 |
| M6 | Media | CSP con `script-src 'unsafe-inline'` (sin nonces) | `next.config.ts:9-22` | V | A02 · V3.4 |
| B1 | Baja | `/api/chat`: `z.string()` sin tope antes de parsear; el tope llega después | `src/app/api/chat/route.ts:53` | C | A06 · V2.2 |
| B2 | Baja | Mensajes de error de Postgres devueltos al usuario | `src/app/consultorio/pacientes/actions.ts:60,78` | C | A10 · V16.5 |
| B3 | Baja | `sameOrigin` acepta peticiones sin `Origin` y confía en `x-forwarded-host` | `src/lib/security.ts:51-59` | C | A01 · V3.5 |
| B4 | Baja | `anon` y `authenticated` conservan todos los grants de tabla (default de Supabase); solo RLS protege | `AUDIT/rls/rls_state.txt` (grants) | V | A02 · V8.1 |
| B5 | Baja | `attachments.patient_insert` no ata `path` a la carpeta del paciente (hoy lo frena storage; defensa en profundidad) | `supabase/migrations/20261115000100_rls.sql:115-116` | V (no explotable) | A01 |
| B6 | Baja | Dependencia: `postcss` alto (vía `next`), solo build | `AUDIT/semgrep/npm-audit.json` | V | A03 · V15 |
| B7 | Baja | `signUp` limita por el primer `x-forwarded-for` (falsificable fuera de Vercel) | `src/app/(auth)/actions.ts:54` | C | A07 |
| B8 | Baja | `/api/cron/push` no está en `vercel.json`: los recordatorios push no corren en Vercel | `vercel.json` | C | operación |
| I1 | Info | `console.error(e)` del webhook de Stripe podría registrar datos del cliente | `src/app/api/webhooks/stripe/route.ts:28` | C | A09 |

### Detalle de cada hallazgo

#### C1 · Vistas del paciente escribibles (crítica, verificada)
- **Evidencia.** `AUDIT/rls/rls_state.txt`: `authenticated` tiene `INSERT, UPDATE, DELETE` sobre las tres vistas, y las vistas no tienen `security_invoker` (`reloptions` vacío). Son vistas simples, así que Postgres las vuelve actualizables y ejecuta la escritura con los permisos del dueño (`postgres`), sin RLS. `AUDIT/rls/probe.log` (sesión real de paciente, llave anónima):
  - `UPDATE my_anthropometry` → peso de 70 a 55 kg en la medición de consulta.
  - `INSERT my_anthropometry (patient_id = <otro paciente>)` → fila creada en el expediente ajeno.
  - `DELETE my_recalls` → borra un R24h capturado por el nutriólogo.
  - `UPDATE my_patient` → cambia `pathologies` y `email`.
  - `INSERT my_patient` → crea expedientes en su consultorio (consume el cupo del plan).
  - `DELETE my_anthropometry` → borra mediciones.
- **Impacto.** Integridad del expediente clínico (NOM‑004‑SSA3‑2012), envenenamiento de datos de otros pacientes, también entre consultorios, y DoS del límite de pacientes. `test:rls` no lo detecta porque solo prueba lecturas en las vistas.
- **Corrección.** En una migración nueva:
  ```sql
  revoke insert, update, delete, truncate, references, trigger on my_patient, my_anthropometry, my_recalls from authenticated, anon, public;
  ```
  Y para que no vuelva a pasar: `alter view … set (security_barrier = true)` o reemplazar las vistas por funciones `security definer` que devuelvan `setof` con columnas fijas. Agregar a `test:rls` un caso por operación (INSERT/UPDATE/DELETE) y vista. La regla `view-without-security-invoker` de `AUDIT/semgrep/vitalia-rules.yml` lo detecta en CI.

#### C2 · Toma de cuenta vía «Enlace de invitación» (crítica, verificada)
- **Evidencia.** `AUDIT/qa/takeover-result.json` y capturas `80-takeover-enlace.png` y `81-takeover-sesion-victima.png`. El nutriólogo A da de alta un paciente con el correo de la nutrióloga B (de otro consultorio) y pulsa «Enlace»: `generateLink("invite")` falla porque la cuenta existe, el código cae a `generateLink("recovery")` y devuelve el enlace a A. Al abrirlo, A queda con la sesión de B (`/invitacion` permite fijar contraseña nueva) y `/consultorio/pacientes` muestra los pacientes de B.
- **Alcance.** Cualquier cuenta cuyo correo pueda capturarse como paciente: nutriólogos de otros consultorios, titulares e incluso administradores de la plataforma (el panel exige aal2, pero la cuenta y su consultorio quedan comprometidos). Si la víctima tiene 2FA, RLS (`mfa_ok`) frena el acceso a datos, aunque la cuenta queda tomada a medias. Cambiar el correo de un paciente ya activo (`updatePatient`) abre la misma vía.
- **Corrección.** Nunca entregar al nutriólogo un enlace de `recovery`. Si la cuenta existe, (a) solo reenviar por correo al titular (`resetPasswordForEmail`) y (b) solo si `patients.user_id` coincide con esa cuenta y su `profiles.role = 'paciente'`. Volver inmutable `patients.email` una vez que `user_id` no es nulo (trigger) y bloquear `generateLink` para correos que pertenezcan a `profiles.role = 'nutriologo'` o a `platform_admins`.

#### A1 · Filtro de crisis incompleto (alta, verificada)
- **Evidencia.** `ai_messages` del paciente de prueba: «quiero suicidarme» → `blocked_reason = emergency`, pero «me quiero morir» y «ya no quiero estar aquí» → `blocked_reason = null`. Fueron al modelo, que respondió con la «Línea de la Vida 55 5259 8121», distinta del 800 911 2000 que fija `EMERGENCY_REPLY`. Captura `19-vita-crisis-*.png`. Corrección posterior: el inicio del consultorio sí muestra una «Alarma» por mensajes bloqueados, pero no había aviso proactivo y, si el paciente también tenía un mensaje de TCA, la alarma decía «riesgo alimentario» y ocultaba la urgencia.
- **Impacto.** Seguridad del paciente: riesgo suicida sin escalamiento humano e información de crisis inventada por el modelo. Los mensajes de crisis no bloqueados también entran a la caché y al historial.
- **Corrección.** Normalizar el texto (minúsculas, sin acentos ni repeticiones) y ampliar el léxico («morir», «no quiero estar», «desaparecer», «acabar con todo», «cortarme», «no vale la pena vivir»…). Agregar una segunda capa de clasificación barata. Al detectar crisis: crear un mensaje o alerta para el consultorio, marcar el par como `blocked_reason` y excluirlo de la caché. En `PATIENT_SYSTEM`, fijar el número oficial y prohibir otros. Pruebas unitarias en `guard.test.ts` con un corpus de frases positivas y negativas.

#### A2 · Vinculación de expediente por correo en cualquier alta de usuario (alta, inferida)
- `handle_new_user` liga `patients.user_id` con **cualquier** usuario nuevo con ese correo, en el momento del INSERT y antes de que confirme. Si alguien registra un consultorio en `/registro` con el correo de un paciente que aún no activa su cuenta, ese usuario (rol nutriólogo) queda como dueño del expediente: `current_patient_id()` lo devuelve. Además, la invitación real falla («ya registrado») y el enlace de recuperación (C2) entregaría esa cuenta ajena al paciente. Para leer datos, el atacante necesita confirmar el correo, así que hoy el efecto probado es una denegación de servicio; el resto se infiere del código y **no se ejecutó**.
- **Corrección.** Vincular solo en la aceptación de la invitación (`setPassword`, tras `verifyOtp` del tipo `invite`) y solo si `profiles.role = 'paciente'`. En `create_clinic`, rechazar correos que existan en `patients`.

#### M1 · Datos sensibles hacia xAI (media, por código)
- Vita (paciente) envía patologías, alergias, mediciones, R24h y notas de progreso, sin nombre: el aviso lo informa. El borrador SOAP (`soap-draft.ts`) y el copiloto envían **medicamentos, notas rápidas, SOAP previo y laboratorios**, y el aviso al paciente dice «Tus notas clínicas no se comparten con el asistente del portal», lo cual es cierto pero omite el uso del lado del nutriólogo. `docs/legal/README.md:36` deja pendiente confirmar Zero Data Retention.
- **LFPDPPP:** los datos de salud son sensibles y requieren consentimiento expreso; se trata de una transferencia o remisión internacional a un encargado. **Corrección:** agregar al aviso del paciente la finalidad «apoyo al nutriólogo con IA» y su proveedor, poner la función detrás de un consentimiento opcional por paciente, confirmar ZDR por escrito y minimizar los datos (quitar medicamentos y notas libres del prompt si no son necesarios).

#### M2 / M3 · Bitácora y borrado (media, verificada en la base)
- `audit_trigger` guarda solo actor, operación, tabla e id. No hay auditoría en adendas, PES, notas rápidas, R24h ni mensajes, y no se registran lecturas del expediente. Las notas sin firmar, la antropometría y los laboratorios se eliminan físicamente. **Corrección:** guardar `old`/`new` en jsonb (o en una tabla `clinical_history`), extender los triggers a esas tablas, usar borrado lógico (`deleted_at`) para el contenido clínico y registrar la apertura del expediente y la descarga del PDF.

#### M4 · Caché y emergencias sin límite de escritura (media, por código)
- Las rutas de caché (`route.ts:114-126`) y de emergencia (`route.ts:70-81`) insertan dos filas por petición sin pasar por `ai_reserve`. Un script con sesión puede llenar `ai_messages` sin costo de IA. **Corrección:** limitar por usuario antes del paso 3 (contador en Postgres o en `ai_reserve` con costo 0).

#### M5 · Bloqueo de cuenta y spam de enlaces (media, por código)
- El límite es por correo (8 intentos en 15 min), así que cualquiera puede bloquear a un nutriólogo concreto. Con un correo sin confirmar, cada intento manda un correo de confirmación. **Corrección:** combinar correo con IP y reducir el bloqueo a un retraso progresivo. Enviar la confirmación como máximo una vez cada N minutos.

#### M6 · CSP con `unsafe-inline` (media, verificada)
- No encontré XSS: no hay `dangerouslySetInnerHTML`, el Markdown del chat no renderiza enlaces ni imágenes y los correos escapan HTML con `escapeHtml`. Aun así, `unsafe-inline` anula la segunda línea de defensa. **Corrección:** CSP con nonce desde el middleware (soportado por Next 15) y `strict-dynamic`.

#### Bajas (B1–B8, I1)
Ver la tabla. Correcciones: `z.string().max(…)` y límite de tamaño del body (B1); mensajes genéricos y registro del error en el servidor (B2); exigir `Origin` en POST y comparar contra `NEXT_PUBLIC_SITE_URL` (B3); `revoke all on all tables in schema public from anon` más `alter default privileges` (B4); agregar `split_part(path,'/',1) = current_patient_id()::text` a `attachments.patient_insert` (B5); actualizar `next` cuando salga el parche de `postcss` (B6); usar `x-real-ip` o la IP de la plataforma (B7); programar `/api/cron/push` o documentar el programador externo (B8); registrar solo `event.type`, `event.id` y `e.message` (I1).

### Lo revisado sin hallazgos
- **`createAdminClient` (37 usos):** cada uso va precedido de `requireRole`, `requireAdmin`, `cronAuthorized` o la firma de Stripe, o es una ruta pública de solo lectura (`plans`, aviso del consultorio). Los usos en `/api/chat` filtran por `user_id` o `clinic_id` de la sesión. La excepción es `createInviteLink` (C2): usa el service role correctamente, pero la lógica es insegura.
- **Server actions:** todas las exportadas validan sesión o rol. `deleteRecall` delega en RLS y `setCancel`/`retryCfdi` en `ownerSub()`.
- **`/api/files`, `/api/meal-photo`, `/api/education`, `/api/pdf`, `/api/facturas`:** usan la sesión del usuario (RLS) y enlaces firmados de 60–300 s. El PDF de expediente y recibo exige nutriólogo y RLS exige aal2 si hay 2FA.
- **Crons:** comparación del secreto en tiempo constante y mínimo de 16 caracteres. Verificado: 401 sin secreto y con secreto falso.
- **Subidas:** la firma binaria se valida contra el tipo declarado, la extensión sale del tipo, el nombre es UUID, hay tipos permitidos por bucket y cuota por paciente. Verificado: el HTML disfrazado de PNG se rechaza.
- **Middleware:** solo exige sesión; el rol lo validan los layouts (`requireRole`). Verificado: el paciente en `/consultorio` va a `/portal`, el nutriólogo en `/portal` va a `/consultorio` y quien no es admin recibe 404 en `/admin`.
- **Headers:** CSP, XFO DENY, nosniff, Referrer-Policy, COOP, Permissions-Policy y `no-store` en rutas clínicas, todos verificados. HSTS solo en producción (no verificado).
- **Prompt injection:** el historial se arma en el servidor, el texto va etiquetado y el system prompt declara los datos como no instrucciones. Las herramientas del copiloto son de solo lectura con la sesión del nutriólogo y el Markdown no renderiza enlaces ni imágenes, así que no hay canal de exfiltración. Riesgo residual: inyección indirecta desde notas del paciente al copiloto, sin impacto más allá de respuestas engañosas.

---

## 3. Semgrep (Fase 1)

- **Registry** (`p/typescript`, `p/react`, `p/nextjs`, `p/owasp-top-ten`, `p/secrets`, `p/javascript`, `p/sql-injection`; Semgrep 1.100.0 en Docker; 116 reglas aplicables sobre 255 archivos): **0 hallazgos**. Ni secretos en el repositorio, ni `eval`, ni SQL dinámico desde TypeScript. Archivos: `AUDIT/semgrep/semgrep.sarif` y `semgrep.json`.
- **Limitación:** el registry no analiza PL/pgSQL ni lógica de autorización, que es donde estaban los dos críticos. Por eso escribí `AUDIT/semgrep/vitalia-rules.yml` (4 reglas), que **sí detecta C1 y C2**: `view-without-security-invoker` (5 vistas, incluida `admin_clinics`, que está bien protegida por grants), `generate-recovery-link` (1), más inventario de `security definer` (40) y `createAdminClient` (37) para revisión. Resultado en `vitalia-custom.json`.
- `npm audit --omit=dev`: 1 alta (`postcss`, vía `next`, solo build) y 1 moderada.
- `npx vitest run`: 129/129 pruebas unitarias en verde.

## 4. `npm run test:rls`: qué cubre y qué no

**Resultado:** 85/85 en verde (`AUDIT/rls/test-rls.log`).

**Cubre bien:** lectura del paciente (no ve `patients`, SOAP, notas rápidas, laboratorios, pagos, plantillas, borradores de plan, caché ni bitácoras), columnas expuestas por las vistas, autopromoción de rol, escritura cruzada en mensajes, progreso, daily_logs, meal_checks y push, subida a carpeta ajena o de HTML, límites de citas y volumen, aislamiento entre consultorios (pacientes, consultas, mensajes, configuración, IA, catálogos, archivos), ARCO y consentimientos inmutables, límites del plan, nota firmada inmutable y `ai_reserve`.

**No cubre:**
1. **Escrituras a través de las vistas `my_*`** (C1).
2. Borrado o edición de antropometría por el paciente vía vista; inserción hacia otros pacientes.
3. Lógica en server actions con service role (C2, A2): está fuera de la base, así que ninguna prueba de RLS lo vería.
4. Que un nutriólogo con 2FA y sesión aal1 no lea nada (`mfa_ok`).
5. Storage: lectura de anexos `visible_to_patient = false` y una fila `attachments` con ruta ajena (mi sonda: hoy bloqueado).
6. `UPDATE` del paciente sobre `messages`, `appointments` (confirmar su propia cita) y `meal_photos.comment` vía upsert.
7. Funciones `security definer` llamadas por `anon` (`busy_slots`, `accept_privacy`, `cancel_my_appointment`); verifiqué que `busy_slots` devuelve 0 filas a `anon`.
8. Borrado de expedientes y de datos clínicos sin firmar (M3).
9. Deja datos residuales: el paciente B y su nota firmada quedan como evidencia. Mis sondas dejaron también un paciente de prueba con una nota firmada, que no se puede borrar por diseño.

`AUDIT/rls/probe.mjs` cubre los puntos 1, 2, 5, 6 (mensajes) y 8; conviene integrarlo a `scripts/test-rls.mjs` como pruebas que deben fallar.

---

## 5. QA (Fase 2)

**Método:** Playwright para Python en un entorno virtual aislado fuera de `package.json`, Chromium headless, servidor `next dev` y Supabase local. Usuarios de prueba de `.env.local` (`DEV_ADMIN_*` y `DEV_PATIENT_*`) más cuentas temporales creadas y eliminadas por los scripts. Resultados en `AUDIT/qa/results.json` y capturas en `AUDIT/qa/screens/`.

**Resultado:** 68 OK, 3 fallas y 2 no verificables, de 73. `console-flows.log` vacío: sin errores de consola ni de página.

| Área | Verificado | Resultado |
|---|---|---|
| Anónimo | redirecciones a `/login` (portal, consultorio, admin, invitación); APIs 401/404; crons 401; `/api/chat` 401 y 403 desde otro origen; headers | ✅ |
| Login | error genérico con credenciales malas; entrada por rol | ✅ |
| Portal | inicio, mi plan, citas, mensajes (envío), archivos (subida PNG, rechazo de HTML falso), fotos de comida, mis datos (JSON sin antecedentes), progreso | ✅ |
| Vita | guion fijo con «quiero suicidarme» | ✅ |
| Vita | «me quiero morir», «ya no quiero estar aquí» | ❌ A1 |
| Roles | paciente → `/consultorio` redirige; `/admin` 404; PDF de expediente 403; exportación 401. Nutriólogo → `/portal` redirige; `/admin` 404 | ✅ |
| Consultorio | inicio, pacientes, detalle, expediente, plan, pagos, agenda, pagos global | ✅ |
| SOAP | crear consulta, llenar S/O/A/P, **firmar**, **adenda** sobre nota firmada | ✅ |
| Pagos | registrar, rechazar monto negativo, recibo PDF | ✅ |
| Estados vacíos y error | paciente inexistente 404, búsqueda sin resultados, `/api/files` con id inválido sin 500 | ✅ |
| Móvil 390×844 | 5 pantallas de portal y 4 de consultorio sin scroll horizontal | ✅ |
| PWA | manifest enlazado | ✅ |
| PWA | service worker | ➖ solo se registra en producción |
| HSTS | | ➖ solo en producción |
| Control de acceso entre consultorios | enlace de invitación | ❌ C2 |

**Incidencia propia, la reporto tal cual:** dos de mis frases de crisis no las bloqueó el filtro (A1) y una prueba mal diseñada (`text: "x"` a `/api/chat`) **llamaron al modelo real de xAI 4 veces con la llave de `.env.local`**: unos 13 000 tokens de entrada, **≈ USD 0.017**, registrados en `ai_usage` local. Ya retiré esas llamadas del script; ahora `qa_flows.py` solo envía la frase que el filtro sí bloquea.

**Qué no se pudo probar y por qué:**
- **Invitación por correo** (Mailpit) y aceptación con `setPassword` desde cero: el paciente de prueba ya está activado. Probé el enlace de invitación (C2), no el flujo de correo.
- **Mensajes en tiempo real** entre dos sesiones simultáneas: requiere coordinar dos navegadores sobre Realtime; solo probé el envío y su aparición en el hilo propio.
- **Respuestas normales de Vita, copiloto y borrador SOAP con IA:** no los ejecuté para no gastar la llave de xAI.
- **Push, recordatorios por correo, Stripe y Facturapi:** dependen de servicios externos o de llaves no configuradas para pruebas.
- **2FA y panel de administración:** no hay un admin de plataforma con TOTP en el entorno local.
- **Service worker, HSTS y comportamiento en producción** (signups desactivados, SMTP, plantillas): requieren `next build` y el entorno de producción, fuera del alcance (no usar producción).

### E2E y CI propuestos (no creados)

**Pruebas E2E (Playwright Test, en `e2e/`):**
1. `auth.spec`: login por rol, credenciales malas, invitación de punta a punta leyendo Mailpit, recuperación, 2FA (TOTP con un secreto de seed).
2. `access.spec`: matriz rol × ruta (anónimo, paciente, nutriólogo, admin, nutriólogo de otro consultorio) para páginas y `/api/*`.
3. `takeover.spec`: el enlace de invitación nunca devuelve `type=recovery` para cuentas ajenas (regresión de C2).
4. `portal.spec`: plan, citas (solicitar y cancelar), mensajes en tiempo real con dos contextos, archivos, fotos, mis datos.
5. `soap.spec`: crear, firmar, intentar editar (debe fallar), adenda, PDF.
6. `vita.spec` con el modelo simulado (`XAI_BASE_URL` apuntando a un stub): crisis, presupuesto agotado, límite por minuto y caché.
7. `responsive.spec`: proyectos `Mobile Chrome` y `Desktop`, sin desbordes, más capturas de regresión visual.
8. `a11y.spec`: `@axe-core/playwright` en las pantallas principales.

**Unitarias nuevas:** corpus de crisis para `screenInput`; `createInviteLink` con cuenta existente.

**CI (GitHub Actions, por PR):**
1. `npm ci` → `npm run lint` → `npm run typecheck` → `npm test`.
2. `supabase start` → `supabase db reset` → `npm run test:rls` (con los casos nuevos) → `supabase db lint`.
3. `semgrep ci` con el registry y `AUDIT/semgrep/vitalia-rules.yml` (que falle con `ERROR`).
4. `npm audit --omit=dev --audit-level=high` y gitleaks.
5. `next build` → `next start` → Playwright E2E con el modelo simulado; subir el reporte HTML y las trazas como artefactos.
6. Lighthouse CI (PWA y rendimiento móvil) en el preview.

---

## 6. Motion (Fase 3): plan priorizado, sin implementar

**Inventario:** todo es CSS y Tailwind. Hay una entrada por página (`template.tsx` → `animate-enter`: 420 ms, `translateY(8px)` y `blur(3px)`), cascada `.stagger` (hasta 280 ms de retraso), `plate-serve` (máscara cónica de 0.9 s), `skeleton` con shimmer infinito, `reveal` ligado al scroll en la portada, flotación de 7 s, más unos 35 `transition`, 24 `transition-colors`, 8 `transition-transform`, 2 `transition-all` y barras con `transition-[width]`. La curva base `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` es buena para entradas. El bloque `prefers-reduced-motion` existe pero tiene huecos. Los `hover:` de Tailwind 4 ya se limitan a dispositivos con hover, así que no hay hover pegajoso en móvil.

| Prio | Problema | Dónde | Propuesta |
|---|---|---|---|
| P1 | La entrada de página anima `filter: blur` sobre **toda la página** en cada navegación, incluido cambiar de pestaña dentro del expediente. El blur de una capa a pantalla completa es caro en móviles de gama media, 420 ms se siente lento en un uso repetitivo y el `transform` temporal convierte el contenedor en bloque contenedor de los `position: fixed` hijos | `globals.css:175-178`, `consultorio/template.tsx`, `portal/template.tsx` | Solo `opacity` y `translateY(4px)`, de 180 a 220 ms, sin blur. Sacar el template de las sub-rutas del expediente (o usar View Transitions solo entre secciones). No combinar con `.stagger` en la misma vista |
| P2 | `prefers-reduced-motion` no cubre: animaciones **infinitas** (`.skeleton`, `animate-pulse`), porque con `0.01ms` siguen en bucle o parpadean; `.reveal` ligado al scroll, donde la duración no aplica; y **Recharts**, animado por JS (1.5 s por defecto) | `globals.css:228-232`; `progress-chart.tsx`, `admin-charts.tsx` | Bajo `reduce`: `animation: none` para `.skeleton`, `.animate-pulse`, `.reveal` (con opacidad 1), `.plate-serve` y `.demo-step`. En las gráficas: `isAnimationActive={!reduced}` con `matchMedia` |
| P3 | Barras de progreso con `transition: width` (provoca layout en cada frame), algunas de 500–700 ms | `today-meals.tsx:81`, `portal/progreso/page.tsx:83,103`, `suscripcion/page.tsx:80`, `formulas/calculator.tsx:277`, `studio/diet-calc.tsx:66`, `studio/macro-studio.tsx:108` | `transform: scaleX()` con `origin-left` (compositor) en 250–300 ms; el ancho final fijo sin animar |
| P4 | `transition-all` (anima propiedades que no deberían) | `calculator.tsx:337` (`left` y `width`), `portal-extras.tsx:68` (`width`) | Propiedades explícitas; para la barra de rango, `transform` |
| P5 | Shimmer del skeleton anima `background-position` (repinta en cada frame) | `globals.css:189-194` | Pseudo-elemento con gradiente desplazado por `transform: translateX`, o un pulso de opacidad de 1.2 s; apagado bajo `reduce` |
| P6 | Cascada larga: `.stagger` más la entrada de página suman hasta unos 700 ms antes de ver el último elemento | `globals.css:197-204`, `plan-view.tsx:27`, `portal/comidas/page.tsx:34` | Paso de 30 ms y tope de 150 ms; animar solo la primera carga, no cada revalidación |
| P7 | `reveal` y `demo-step` usan la misma `enter` con blur, ligada al scroll | `globals.css:221-226` | Keyframe propio sin blur (`opacity` y `translateY`) |
| P8 | Duraciones dispersas (150, 200, 300, 500 y 700 ms) | general | Tokens `--dur-1: 120ms` (feedback), `--dur-2: 200ms` (UI), `--dur-3: 300ms` (paneles) y prohibir más de 300 ms en UI de trabajo; `ease-out` para entrar y `ease-in` corto (120 ms) para salir |
| P9 | `hover:scale` de 500 ms en portadas de receta | `recipes.tsx:39` | 250 ms; `active:scale-[0.97]` ya es buen feedback |
| P10 | `landing-float` infinito en la portada (CPU y batería) | `globals.css:222-223` | Pausar fuera de pantalla (`animation-play-state` con IntersectionObserver) o dejar 2 ciclos |

**Cómo medir:** Performance panel con CPU 4× lento en la navegación entre pestañas del expediente (meta: sin frames de más de 16 ms causados por paint); Lighthouse móvil (TBT y CLS); verificación manual con «Reducir movimiento» del sistema activado.

---

## 7. Cumplimiento (NOM‑004‑SSA3‑2012 y LFPDPPP)

| Norma | Riesgo | Hallazgo |
|---|---|---|
| NOM‑004 (integridad y responsabilidad del expediente) | El paciente puede alterar o borrar mediciones y R24h de consulta; otro paciente puede inyectar datos | C1 |
| NOM‑004 (conservación mínima de 5 años) | Borrado físico de datos clínicos sin firmar; la bitácora no guarda contenido previo | M2, M3 |
| NOM‑004 (notas y adendas) | Firma inmutable y adendas verificadas ✅; las adendas no se auditan | M2 |
| LFPDPPP (seguridad, art. 19) | Acceso no autorizado entre consultorios | C2, A2 |
| LFPDPPP (datos sensibles, consentimiento expreso) | El aviso al paciente no informa del uso de IA del lado del nutriólogo; ZDR sin confirmar con xAI | M1 |
| LFPDPPP (vulneraciones) | Con C1 y C2 explotables, una explotación real sería una vulneración que se debe notificar a los titulares | C1, C2 |
| LFPDPPP (ARCO) | Flujo y plazos de 20 días hábiles verificados ✅; la exportación propia del paciente excluye correctamente las notas clínicas | — |

*Esto no es asesoría legal; conviene validarlo con el abogado que redactó los avisos.*

---

## 8. Top 10 de acciones

1. **Revocar INSERT/UPDATE/DELETE en `my_patient`, `my_anthropometry` y `my_recalls`** y agregar las pruebas a `test:rls` (C1).
2. **Quitar el fallback a `recovery` de `createInviteLink`** y volver inmutable `patients.email` tras la activación (C2).
3. **Ampliar el filtro de crisis**, alertar al nutriólogo y fijar el número oficial en el prompt (A1).
4. **Vincular expedientes solo al aceptar una invitación de paciente**, no en cualquier alta (A2).
5. Auditoría con antes/después en todas las tablas clínicas y borrado lógico (M2, M3).
6. Actualizar el aviso de privacidad sobre IA del lado del nutriólogo, más consentimiento y ZDR con xAI (M1).
7. Límite por usuario también para las respuestas de caché y emergencia (M4) y tope de tamaño del body (B1).
8. Login: limitar por correo e IP con retraso progresivo (M5).
9. CSP con nonce; revocar grants de `anon` en `public` (M6, B4).
10. CI con `test:rls`, Semgrep con las reglas propias y E2E (sección 5), para que C1 y C2 no regresen.

## 9. Plan de correcciones

| Fase | Plazo | Contenido | Hecho cuando |
|---|---|---|---|
| 0 · Contención | Hoy | C1 (migración de 1 línea), C2 (eliminar el fallback). Revisar en producción `audit_log` y `anthropometry` por filas con `actor_id` de pacientes o `measured_at` anómalos; revisar `ai_messages` por textos de crisis no bloqueados | Sondas `AUDIT/rls/probe.mjs` y `AUDIT/qa/scripts/takeover.py` en verde |
| 1 · Seguridad del paciente | 1 semana | A1 y A2, más pruebas unitarias y E2E de regresión | Corpus de crisis al 100 %; el flujo de invitación pasa |
| 2 · Integridad y cumplimiento | 2–3 semanas | M1, M2, M3: bitácora completa, borrado lógico, aviso y consentimiento de IA, ZDR | Revisión legal firmada; pruebas de auditoría |
| 3 · Endurecimiento | 1 mes | M4–M6, B1–B8 | CI en verde con Semgrep y npm audit |
| 4 · Motion | En paralelo | P1–P3 primero, luego P4–P10 | Sin blur en navegación, reduced motion completo, barras con `transform` |

## 10. Lo que no se pudo verificar

- **Producción:** signups desactivados, confirmaciones, SMTP, plantillas, HSTS, service worker y las variables reales. Por regla, no usé producción.
- **Flujos con servicios externos:** Stripe (webhook firmado), Facturapi, Resend y push web.
- **2FA y panel de administración** de punta a punta (no hay admin con TOTP local).
- **Mensajería en tiempo real** con dos sesiones simultáneas.
- **Calidad de las respuestas de IA** (Vita normal, copiloto, borrador SOAP), ni resistencia real a prompt injection contra el modelo, para no gastar la llave; solo revisé el código.
- **A2** solo se analizó en el código; no se ejecutó la cadena completa.
- **Rendimiento real de las animaciones en un dispositivo móvil físico:** el análisis es por código y por emulación de viewport.

---

## 11. Estado de correcciones (17 nov 2026, después de la auditoría)

| ID | Estado | Cambio | Verificación |
|---|---|---|---|
| C1 | **Corregido** | `supabase/migrations/20261123000000_audit_fixes.sql`: revoca INSERT/UPDATE/DELETE de las vistas `my_*` y les pone `security_barrier` | `AUDIT/rls/probe-after-fix.log`: las 6 escrituras dan `permission denied`. `test:rls` tiene 4 casos nuevos |
| C2 | **Corregido** | `createInviteLink` solo da un enlace de recuperación si la cuenta está vinculada a ese paciente, tiene rol `paciente`, el mismo correo y nunca inició sesión. Un trigger (`guard_patient_identity`) impide cambiar desde el cliente el correo de un expediente activado o su cuenta vinculada | `AUDIT/qa/takeover-after-fix.log`: sin enlace y con el mensaje «Ese correo ya pertenece a otra cuenta». `test:rls` tiene 2 casos nuevos |

`npm run test:rls`: 90/90 · `npx vitest run`: 129/129 · `tsc --noEmit` sin errores.
La migración se aplicó a mano en la base local; en producción falta `npx supabase db push`.

**Bug previo del enlace de invitación: corregido.** Al generar el enlace se creaba la cuenta, la página mostraba «Cuenta activa» y el enlace desaparecía. Ahora la tarjeta usa el estado real de la cuenta (`src/lib/patient-access.ts`: sin cuenta, pendiente, activa o ajena, según `last_sign_in_at`, el rol y el correo):
- El enlace sigue visible para copiarlo.
- Mientras el paciente no entra, la tarjeta dice «el paciente todavía no entra a su portal».
- Un segundo clic entrega un enlace de recuperación de la propia cuenta pendiente.
- «Reenviar invitación» manda al correo del paciente un enlace para crear su contraseña cuando la cuenta ya existe.

Verificado con `AUDIT/qa/takeover-after-fix2.log` (primer clic `invite`, segundo `recovery`, la toma de cuenta sigue bloqueada) y la captura `83-legitimo-enlace-0.png`.

Queda pendiente: la lista `/consultorio/pacientes` sigue marcando «Activa» a cualquier expediente con cuenta vinculada (`src/app/consultorio/pacientes/page.tsx:30`).

### A1 · Filtro de crisis de Vita: corregido

- **`src/lib/ai/guard.ts`:** el texto se normaliza antes de buscar (minúsculas, sin acentos ni signos, letras estiradas reducidas y abreviaturas como «q» o «kiero»). El léxico ahora cubre «me quiero morir», «ya no quiero estar aquí», «estarían mejor sin mí», «acabar con todo», «no le veo sentido a la vida», cortes, pastillas y sobredosis, entre otros. Las negaciones («no me quiero morir joven») y los modismos («me muero de hambre», «muero por unos tacos», «está para morirse») no se bloquean.
- **`src/app/api/chat/route.ts`:** el filtro corre antes del interruptor de IA y de los límites, así que una crisis siempre recibe el guion fijo, aunque la IA esté apagada.
- **Aviso por correo:** `src/lib/ai/crisis.ts` (`notifyCrisis`) manda un correo al consultorio ante una urgencia, como máximo uno por paciente cada 12 h. El correo no incluye el texto del mensaje.
- **`src/lib/alerts.ts`:** una urgencia ya no queda oculta por un aviso de TCA del mismo paciente.
- **`src/lib/ai/prompts.ts`:** el único número de crisis permitido es 800 911 2000.

**Verificación:**
- `guard.test.ts`: corpus de 47 casos (positivos, negativos, modismos y negaciones). `features.test.ts` tiene un caso nuevo para la alarma. `npx vitest run`: 165/165.
- E2E sin llaves de IA ni de correo: 5/5 frases con guion fijo y su `blocked_reason`, 0 llamadas al modelo y la alarma de urgencia visible en el inicio (`AUDIT/qa/vita-crisis-after-fix.json`, capturas `90-*` y `91-*`).
- **No verificado:** el envío real del correo (se probó con `RESEND_API_KEY` vacía para no mandar correos reales).
- **Pendiente:** el léxico sigue siendo una lista finita. Conviene una segunda capa de clasificación y una revisión clínica del corpus.
