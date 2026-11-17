# Cumplimiento legal de VitalIA (México)

> Borradores técnicos preparados para revisión de un abogado especialista en protección de datos. **No es asesoría legal.**
> Base: nueva LFPDPPP (DOF 20-03-2025, última reforma 14-11-2025), NOM-004-SSA3-2012, LFPC (reforma a cobros recurrentes vigente desde 13-12-2025).

## Qué ya hace la aplicación

| Obligación | Dónde | Fundamento |
|---|---|---|
| Aviso de privacidad integral de VitalIA (nutriólogos y visitantes) | `/privacidad` | LFPDPPP arts. 14–16 |
| Términos y condiciones + contrato de encargo (anexo) | `/terminos`, `/terminos#encargo` | arts. 2 (encargado), 20 |
| Aviso simplificado al registrarse, con enlace al integral | `/registro` | art. 16 fr. II |
| Aviso integral de cada consultorio para sus pacientes, con sus datos de responsable | `/aviso/<clinicId>` | art. 15 |
| Versión imprimible para firma en papel | `/aviso/<clinicId>?firma=1` | art. 8 |
| Aviso simplificado + consentimiento expreso al activar el portal | `/invitacion` | arts. 8, 16 |
| Consentimiento de madre/padre/tutor para menores | `/invitacion`, `/portal/mis-datos` | Código Civil (representación) |
| Evidencia de cada aceptación: documento, versión, fecha, IP, navegador, tutor | tabla `legal_acceptances` (inmutable) | carga de la prueba del consentimiento |
| Re-aceptación cuando cambia la versión del aviso | `/portal/mis-datos` | art. 11 |
| Constancia de consentimientos firmados en papel | `/consultorio/privacidad` | art. 8 |
| Solicitudes ARCO y revocación desde el portal, con plazo de 20 días hábiles | `/portal/mis-datos`, tabla `arco_requests` | arts. 21–34 |
| Bandeja del consultorio para responder ARCO, con vencidas resaltadas | `/consultorio/privacidad` | arts. 29, 31 |
| Descarga de datos del portal (acceso en autoservicio) | `/api/mis-datos` | art. 22 |
| Solo cookies técnicas (sesión); sin analítica ni publicidad → sin banner | — | art. 7 (consentimiento tácito) |
| Aislamiento por consultorio, notas clínicas invisibles al paciente, bitácora | RLS en Postgres | art. 18 |
| Cédula profesional opcional al registrarse | `/registro` | buena práctica |
| Confirmación del correo antes de activar la cuenta del nutriólogo | `/registro/confirma` | seguridad |
| Verificación en dos pasos (TOTP); con ella activa, la base niega permisos de personal a sesiones sin verificar | Ajustes, `/login/verificar` | art. 18 |
| Cancelación con un clic, aviso de renovación 5 días antes y exportación del consultorio | Suscripción, cron diario | LFPC art. 76 Bis |

## Pendientes antes de tener usuarios reales

1. **Completar datos del responsable** en `src/lib/legal.ts` (o variables `LEGAL_COMPANY`, `LEGAL_ADDRESS`, `LEGAL_EMAIL`) y poner `draft: false`.
   Recomendado: operar mediante una sociedad (p. ej., SAS) y un correo exclusivo de privacidad.
2. **Revisión del abogado** de `/privacidad`, `/terminos` (incluye limitación de responsabilidad y jurisdicción `[ciudad, pendiente]`) y del aviso de pacientes (`src/components/patient-privacy-notice.tsx`).
3. **Contratos con proveedores (subencargados):** aceptar/firmar el DPA de Supabase, Vercel, Resend y xAI; guardar copia.
   - xAI: confirmar retención de datos de la API y activar *Zero Data Retention* si está disponible para la cuenta.
   - Considerar alojar la base de datos en una región y proveedor con DPA explícito para datos de salud.
4. **Antes de cobrar** (el código ya está; falta configurarlo):
   - Confirmar precios. Los actuales son provisionales: $299 / $499 / $799 / $1,199 MXN al mes con IVA, en la tabla `plans`.
   - **Stripe:** crear la cuenta, poner `STRIPE_SECRET_KEY` (prueba) en `.env.local` y correr
     `stripe listen --forward-to localhost:3000/api/webhooks/stripe` para obtener `STRIPE_WEBHOOK_SECRET`.
     En producción, dar de alta el webhook con los eventos de `.env.example`.
     Configurar los reintentos de cobro (Billing → Revenue recovery) para cancelar la suscripción al agotarlos.
     Las llaves live se ignoran hasta definir `BILLING_ALLOW_LIVE=1`.
   - **Facturapi:** crear la organización emisora con los datos fiscales de VitalIA (y su CSD en producción) y poner `FACTURAPI_KEY`.
     Clave de producto SAT usada: 81112106; unidad: E48. Que el contador confirme ambas, el régimen de VitalIA y la factura global
     a público en general para quien no dé sus datos fiscales.
   - Ya están en la app: Checkout con renovación mensual y consentimiento expreso, días de prueba conservados, cambio de plan con prorrateo,
     tarjeta y recibos (portal de Stripe), aviso de cobro rechazado, CFDI por pago con PDF/XML, cancelación inmediata, aviso 5 días
     antes de cada renovación y exportación completa del consultorio. Prueba local: `npm run test:billing`.
5. **Producción (Supabase en la nube):** activar *Confirm email* y *MFA → TOTP* en el panel de Auth (en local ya están en `supabase/config.toml`),
   configurar `RESEND_API_KEY`/`EMAIL_FROM` para que lleguen los correos de confirmación, y documentar respaldos y su restauración.
6. **Marca:** buscar «VitalIA» en MARCia/MARCANET (IMPI) y registrar clases 9, 42 y 44.
7. **Consultas a especialistas:**
   - ¿Aplica obligatoriamente la NOM-024-SSA3-2012 (certificación del expediente electrónico) a consultorios privados de nutrición?
   - ¿El copiloto de IA podría considerarse software como dispositivo médico ante COFEPRIS? Hoy se presenta como herramienta de apoyo administrativo y de cálculo, con decisión siempre del profesional.
   - Verificar si ya se publicó el nuevo Reglamento de la LFPDPPP.
8. **Días inhábiles:** el plazo ARCO descuenta fines de semana y los descansos obligatorios del art. 74 LFT. Si la autoridad publica
   un calendario distinto, ajustar `mx_holiday()` en la base.

## Panel de administración (`/admin`)

- Acceso: `npm run make-admin -- correo@...` (y `-- correo@... --quitar`). Exige verificación en dos pasos; a quien no es admin le responde 404.
- Muestra datos de cuenta, cobro y **conteos**; nunca nombres, expedientes ni notas de pacientes, ni permite entrar como otro usuario.
- Cada acción (prueba, cortesía, plan, suspensión, tope de IA, ajustes) exige motivo y queda en `admin_actions`, que no se puede editar ni borrar.
- Pruebas: `npm run test:admin`.

## Inventario de datos

| Titular | Datos | Responsable | Base | Conservación |
|---|---|---|---|---|
| Nutriólogo | identificación, contacto, cédula, suscripción, uso | VitalIA | contrato (art. 9 fr. IV) | vigencia + plazos fiscales |
| Nutriólogo | fiscales (RFC, razón social, régimen, CP), pagos y CFDI; la tarjeta solo la guarda Stripe | VitalIA | contrato y obligación legal | 5 años (CFF art. 30) |
| Paciente | identificación, contacto | Nutriólogo | consentimiento | 5 años desde el último acto (NOM-004) |
| Paciente | salud (sensibles): antecedentes, mediciones, laboratorios, fotos, registros, notas | Nutriólogo | consentimiento expreso y por escrito (art. 8) | 5 años desde el último acto; en menores, desde la mayoría de edad |
| Visitante | IP, navegador (seguridad) | VitalIA | interés legítimo / tácito | corto plazo (registros) |

Subencargados: Supabase, Vercel, Resend, xAI y Stripe (EE. UU.); Facturapi (México). Lista en `LEGAL.processors` (`src/lib/legal.ts`), que alimenta ambos avisos.

## Plan ante una vulneración de seguridad (art. 19)

1. **Contener** (minutos): revocar llaves o sesiones comprometidas (`SUPABASE_SERVICE_ROLE_KEY`, `XAI_API_KEY`), apagar el asistente de IA desde Ajustes si aplica.
2. **Evaluar** (primeras 24 h): qué datos, de qué consultorios y pacientes, desde cuándo. Usar `audit_log` y los registros de Supabase.
3. **Avisar a los nutriólogos afectados de inmediato** (son los responsables): qué pasó, datos afectados, medidas tomadas, recomendaciones para sus pacientes.
4. **Apoyar al nutriólogo** para que informe a sus pacientes de inmediato cuando la vulneración afecte de forma significativa sus derechos.
5. **Documentar** el incidente, causa, medidas y fechas; corregir la causa raíz.

## Cambiar un documento legal

1. Editar el texto.
2. Subir la versión en `LEGAL.versions` y la fecha `LEGAL.updated`.
3. Avisar a los usuarios. Los pacientes verán la solicitud de re-aceptación en **Mis datos** y el consultorio los verá como pendientes en **Privacidad y ARCO**.
