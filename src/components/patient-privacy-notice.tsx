import Link from "next/link";
import type { ClinicPrivacy } from "@/lib/clinic-privacy";
import { LEGAL } from "@/lib/legal";

const pending = (v: string | null, what: string) => v || `[${what}, pendiente]`;
const responsible = (c: ClinicPrivacy) => c.nutritionist ? `${c.nutritionist}${c.name ? `, a través del consultorio «${c.name}»` : ""}` : pending(null, "nombre del responsable");

/** Aviso simplificado (art. 16, fr. II): se muestra al recabar datos por medios electrónicos. */
export function PatientNoticeShort({ c }: { c: ClinicPrivacy }) {
  return (
    <div className="space-y-2">
      <p>
        <strong>{responsible(c)}</strong>, con domicilio en {pending(c.address, "domicilio")}, es responsable de tus datos personales, incluidos tus
        <strong> datos de salud (datos sensibles)</strong>: antecedentes, mediciones, laboratorios, hábitos, fotos de tus comidas y lo que registres en tu portal.
      </p>
      <p>
        Los usaremos para tu atención nutricional: integrar tu expediente clínico, elaborar tu plan, dar seguimiento a tu evolución, agendar citas y
        enviarte recordatorios. La plataforma VitalIA y sus proveedores (en Estados Unidos) los tratan solo por cuenta de tu nutriólogo. El asistente de IA
        recibe tus mensajes sin tu nombre.
      </p>
      <p>
        Puedes ejercer tus derechos ARCO y revocar tu consentimiento desde <em>Mis datos</em> en tu portal o escribiendo a {pending(c.email, "correo")}.
        Consulta el <Link href={`/aviso/${c.clinicId}`} target="_blank" className="font-semibold text-primary underline">aviso de privacidad integral</Link>.
      </p>
    </div>
  );
}

/** Aviso integral del consultorio para sus pacientes. */
export function PatientNoticeFull({ c }: { c: ClinicPrivacy }) {
  return (
    <>
      <h2>1. Responsable</h2>
      <p>
        {responsible(c)}{c.license ? ` (cédula profesional ${c.license})` : ""}, con domicilio en {pending(c.address, "domicilio")}, es responsable del
        tratamiento de tus datos personales conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares (LFPDPPP).
        Contacto: {pending(c.email, "correo")}{c.phone ? ` · ${c.phone}` : ""}.
      </p>

      <h2>2. Datos que se tratan</h2>
      <ul>
        <li><strong>Identificación y contacto:</strong> nombre, correo, teléfono, fecha de nacimiento, sexo y ocupación.</li>
        <li>
          <strong>Datos sensibles de salud:</strong> motivo de consulta, antecedentes personales y familiares, patologías, alergias, medicamentos y
          suplementos, estilo de vida, historia dietética, mediciones antropométricas y de composición corporal, resultados de laboratorio, fotos de
          comidas y de progreso, registros de alimentación, notas clínicas y diagnósticos nutricionales.
        </li>
      </ul>

      <h2>3. Finalidades</h2>
      <ul>
        <li>Brindarte atención nutricional y elaborar, ajustar y dar seguimiento a tu plan.</li>
        <li>Integrar y conservar tu expediente clínico conforme a la NOM-004-SSA3-2012.</li>
        <li>Darte acceso a tu portal: plan, recetas, progreso, mensajes, citas y asistente de IA.</li>
        <li>Agendar citas y enviarte recordatorios y avisos relacionados con tu atención.</li>
      </ul>
      <p>No se usan tus datos para publicidad ni se venden. Cualquier finalidad distinta requerirá tu nuevo consentimiento.</p>

      <h2>4. Consentimiento</h2>
      <p>
        Por tratarse de datos sensibles, se requiere tu <strong>consentimiento expreso y por escrito</strong>, que otorgas al aceptar este aviso en tu
        portal (con tu cuenta autenticada) o firmándolo en consulta. Si eres menor de edad, lo otorga tu madre, padre o tutor.
      </p>

      <h2>5. Quién más trata tus datos</h2>
      <p>
        Tu nutriólogo usa la plataforma VitalIA ({LEGAL.company}), que trata tus datos únicamente por su cuenta y con obligaciones de confidencialidad y
        seguridad. VitalIA se apoya en los siguientes proveedores, ubicados fuera de México:
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Proveedor</th><th>Para qué</th><th>País</th></tr></thead>
          <tbody>{LEGAL.processors.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.role}</td><td>{p.country}</td></tr>)}</tbody>
        </table>
      </div>
      <p>
        El asistente de IA recibe tus mensajes y la información de tu plan necesaria para responderte, <strong>sin tu nombre</strong>. Tus notas clínicas
        no se comparten con el asistente del portal. Tus datos solo se comunican a otras personas cuando una ley o una autoridad lo exige, o si los
        necesita otro profesional de la salud para atenderte en una urgencia.
      </p>

      <h2>6. Conservación</h2>
      <p>
        Tu expediente clínico se conserva al menos {LEGAL.retentionYears} años desde tu última consulta, como lo exige la NOM-004-SSA3-2012 (en menores
        de edad, desde que cumplen la mayoría de edad). Pasado ese plazo, se elimina.
      </p>

      <h2>7. Tus derechos ARCO y la revocación del consentimiento</h2>
      <p>
        Puedes <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong>, pedir su <strong>cancelación</strong>, <strong>oponerte</strong> a
        su uso o <strong>revocar tu consentimiento</strong>:
      </p>
      <ul>
        <li>Desde tu portal, en <em>Mis datos</em>, donde además puedes descargar la información que ves en él, o</li>
        <li>Escribiendo a {pending(c.email, "correo")} con tu nombre, una identificación y la descripción de lo que solicitas.</li>
      </ul>
      <p>
        Recibirás respuesta en un máximo de 20 días hábiles y, si procede, se hará efectiva en los 15 días hábiles siguientes. El trámite es gratuito.
        La cancelación del expediente clínico puede negarse mientras deba conservarse por ley (art. 25 de la LFPDPPP); en ese caso tus datos se bloquean:
        dejan de usarse y se eliminan al terminar el plazo.
      </p>

      <h2>8. Cookies</h2>
      <p>El portal usa solo cookies técnicas indispensables para mantener tu sesión. No usa cookies de publicidad ni de rastreo.</p>

      <h2>9. Seguridad</h2>
      <p>
        Tus datos están protegidos con controles de acceso: solo tu nutriólogo puede ver tu expediente, ningún otro consultorio puede acceder a él y las
        notas clínicas no se muestran en el portal. Si ocurriera una vulneración que te afecte de forma significativa, se te informará de inmediato.
      </p>

      <h2>10. Cambios a este aviso</h2>
      <p>Cualquier cambio se publicará en esta página y se te avisará en tu portal o por correo. Si implica nuevas finalidades, se te pedirá de nuevo tu consentimiento.</p>

      <h2>11. Autoridad</h2>
      <p>Si consideras vulnerado tu derecho a la protección de tus datos, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno.</p>
      <p className="text-sm text-muted">Versión {LEGAL.versions.aviso_paciente}.</p>
    </>
  );
}
