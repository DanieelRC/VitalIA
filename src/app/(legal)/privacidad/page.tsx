import Link from "next/link";
import { LegalDoc } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Aviso de privacidad", description: "Aviso de privacidad integral de VitalIA." };

export default function PrivacyPage() {
  return (
    <LegalDoc title="Aviso de privacidad integral" subtitle="Para nutriólogos usuarios de VitalIA y visitantes del sitio." updated={LEGAL.updated} draft={LEGAL.draft}>
      <p className="callout">
        Si eres <strong>paciente</strong> de un consultorio que usa VitalIA, el responsable de tus datos de salud es tu nutriólogo, no VitalIA.
        Consulta el aviso de privacidad de tu consultorio desde tu portal, en <em>Mis datos</em>.
      </p>

      <h2>1. Responsable</h2>
      <p>
        {LEGAL.company}, con domicilio en {LEGAL.address} (en adelante, «VitalIA»), es responsable del tratamiento de los datos personales de los
        nutriólogos que contratan la plataforma y de los visitantes de este sitio, conforme a la Ley Federal de Protección de Datos Personales en
        Posesión de los Particulares (LFPDPPP).
      </p>
      <p>Para cualquier asunto de privacidad: <strong>{LEGAL.email}</strong>.</p>

      <h2>2. Datos que tratamos</h2>
      <ul>
        <li><strong>Identificación y contacto:</strong> nombre, correo electrónico, teléfono, nombre y domicilio del consultorio.</li>
        <li><strong>Profesionales:</strong> cédula profesional (cuando la proporcionas).</li>
        <li><strong>De la cuenta y la suscripción:</strong> plan contratado, fechas de vigencia, uso de la plataforma y del asistente de IA.</li>
        <li><strong>Fiscales y de pago:</strong> RFC, nombre o razón social, régimen fiscal, código postal fiscal, uso del CFDI, historial de pagos y facturas. Los datos de tu tarjeta los recibe y guarda directamente Stripe; VitalIA no los conoce ni los almacena.</li>
        <li><strong>Técnicos:</strong> dirección IP, tipo de navegador y fecha y hora de acceso, con fines de seguridad.</li>
      </ul>
      <p>
        No tratamos datos personales sensibles de nutriólogos ni visitantes. Los datos de salud de los pacientes los trata VitalIA únicamente
        <strong> por cuenta de cada nutriólogo</strong>, como encargado, en los términos del <Link href="/terminos#encargo">contrato de encargo</Link>.
      </p>

      <h2>3. Finalidades</h2>
      <h3>Necesarias para el servicio</h3>
      <ul>
        <li>Crear y administrar tu cuenta y tu consultorio.</li>
        <li>Prestar el servicio contratado, incluido el asistente y el copiloto de IA.</li>
        <li>Administrar tu suscripción, cobros y facturación.</li>
        <li>Brindarte soporte y enviarte avisos sobre el servicio, la seguridad y cambios a estos documentos.</li>
        <li>Prevenir fraudes, abusos y accesos no autorizados (por ejemplo, limitar intentos de inicio de sesión).</li>
        <li>Cumplir obligaciones legales y fiscales.</li>
      </ul>
      <h3>Adicionales (requieren tu consentimiento)</h3>
      <ul>
        <li>Enviarte novedades, encuestas o contenido sobre VitalIA.</li>
      </ul>
      <p>Puedes negarte a las finalidades adicionales en cualquier momento escribiendo a {LEGAL.email}, sin que esto afecte el servicio.</p>

      <h2>4. Proveedores que tratan datos por nuestra cuenta</h2>
      <p>
        Para operar la plataforma usamos los siguientes proveedores, que actúan como encargados y tratan los datos solo para prestarnos su servicio.
        Varios se ubican fuera de México:
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Proveedor</th><th>Para qué</th><th>País</th></tr></thead>
          <tbody>{LEGAL.processors.map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.role}</td><td>{p.country}</td></tr>)}</tbody>
        </table>
      </div>
      <p>
        El asistente de IA recibe la información mínima necesaria. En el copiloto, el expediente se envía <strong>sin el nombre del paciente</strong>.
        No vendemos ni rentamos datos personales. Solo los comunicamos a autoridades cuando una ley o una resolución lo exige.
      </p>

      <h2>5. Cómo limitar el uso de tus datos</h2>
      <p>Puedes pedir que dejemos de usar tus datos para finalidades adicionales escribiendo a {LEGAL.email}.</p>

      <h2>6. Derechos ARCO y revocación del consentimiento</h2>
      <p>
        Puedes <strong>acceder</strong> a tus datos, <strong>rectificarlos</strong>, <strong>cancelarlos</strong> u <strong>oponerte</strong> a su
        tratamiento, y revocar tu consentimiento, enviando una solicitud a {LEGAL.email} con:
      </p>
      <ol>
        <li>Tu nombre y un medio para recibir la respuesta.</li>
        <li>Un documento que acredite tu identidad o la de tu representante.</li>
        <li>La descripción clara de los datos y del derecho que quieres ejercer.</li>
        <li>Cualquier dato que ayude a localizar tu información.</li>
      </ol>
      <p>
        Te responderemos en un máximo de 20 días hábiles y, si procede, lo haremos efectivo dentro de los 15 días hábiles siguientes. El trámite es
        gratuito. Algunos datos deben conservarse por obligaciones legales o fiscales; en ese caso se bloquean y se eliminan al terminar el plazo.
      </p>

      <h2>7. Cookies y tecnologías similares</h2>
      <p>
        Usamos únicamente <strong>cookies técnicas indispensables</strong> para mantener tu sesión iniciada de forma segura, y el almacenamiento local
        del navegador para recordar preferencias de la interfaz (por ejemplo, tu lista del súper). <strong>No usamos cookies de analítica, publicidad ni
        rastreo de terceros.</strong> Si lo hiciéramos en el futuro, te pediremos antes tu consentimiento.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas administrativas, técnicas y físicas: cifrado en tránsito, separación de la información de cada consultorio a nivel de base de
        datos, controles de acceso por rol, bitácora de accesos, respaldos y límites contra intentos de acceso. Si ocurriera una vulneración que afecte de
        forma significativa tus derechos, te lo informaremos de inmediato.
      </p>

      <h2>9. Cambios a este aviso</h2>
      <p>
        Publicaremos cualquier cambio en esta página con su fecha de actualización y te lo notificaremos por correo o dentro de la plataforma. Si el
        cambio implica nuevas finalidades, te pediremos de nuevo tu consentimiento.
      </p>

      <h2>10. Autoridad</h2>
      <p>
        Si consideras que tu derecho a la protección de datos fue vulnerado, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno, autoridad
        en la materia conforme a la LFPDPPP.
      </p>
      <p className="text-sm text-muted">Versión {LEGAL.versions.aviso_vitalia}.</p>
    </LegalDoc>
  );
}
