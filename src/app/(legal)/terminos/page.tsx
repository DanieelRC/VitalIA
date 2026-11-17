import Link from "next/link";
import { LegalDoc } from "@/components/legal-doc";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Términos y condiciones", description: "Términos y condiciones de uso de VitalIA y contrato de encargo de datos personales." };

export default function TermsPage() {
  return (
    <LegalDoc title="Términos y condiciones" subtitle="Contrato de prestación del servicio VitalIA para profesionales de la nutrición." updated={LEGAL.updated} draft={LEGAL.draft}>
      <p>
        Estos términos regulan el uso de VitalIA, plataforma de {LEGAL.company} («VitalIA»), por parte del profesional de la nutrición que crea un
        consultorio («tú» o «el Nutriólogo»). Al crear tu cuenta aceptas estos términos, el <Link href="/privacidad">aviso de privacidad</Link> y el{" "}
        <a href="#encargo">contrato de encargo</a> incluido al final.
      </p>

      <h2>1. El servicio</h2>
      <p>
        VitalIA es un software en línea para administrar un consultorio de nutrición: expediente, antropometría, fórmulas, planes de alimentación,
        agenda, mensajes, portal del paciente y un asistente de inteligencia artificial. Es una <strong>herramienta de apoyo</strong>: no presta
        servicios de salud, no diagnostica y no sustituye tu juicio profesional.
      </p>

      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Debes ser profesional de la nutrición o de la salud y, si te la pedimos, acreditarlo con tu cédula profesional.</li>
        <li>Eres responsable de la confidencialidad de tu contraseña y de lo que ocurra con tu cuenta. Avísanos de inmediato si sospechas un acceso indebido.</li>
        <li>La información que registras debe ser veraz.</li>
      </ul>

      <h2>3. Tu responsabilidad profesional</h2>
      <ul>
        <li>Las decisiones clínicas, los planes, las notas y los mensajes que envías a tus pacientes son tu responsabilidad.</li>
        <li>
          El asistente y el copiloto de IA generan <strong>borradores y cálculos de apoyo que pueden contener errores</strong>. Debes revisarlos antes
          de aplicarlos. La plataforma no guarda ningún contenido de la IA en el expediente sin tu aprobación.
        </li>
        <li>Debes cumplir la normativa aplicable a tu ejercicio profesional, incluida la NOM-004-SSA3-2012 sobre el expediente clínico.</li>
      </ul>

      <h2>4. Tus pacientes y sus datos</h2>
      <p>
        Respecto de los datos de tus pacientes, <strong>tú eres el responsable</strong> y VitalIA es tu encargado. Te corresponde:
      </p>
      <ul>
        <li>Completar los datos de tu consultorio para que tu aviso de privacidad identifique al responsable y su domicilio.</li>
        <li>
          Poner tu aviso de privacidad a disposición de cada paciente y obtener su <strong>consentimiento expreso y por escrito</strong> para el
          tratamiento de sus datos de salud: en el portal al activar su cuenta o firmado en papel en consulta (y registrarlo en la plataforma).
        </li>
        <li>En el caso de menores de edad, obtener el consentimiento de su madre, padre o tutor.</li>
        <li>Atender las solicitudes de derechos ARCO de tus pacientes dentro de los plazos legales. La plataforma te ayuda a recibirlas y darles seguimiento.</li>
      </ul>

      <h2>5. Uso aceptable</h2>
      <p>No puedes usar VitalIA para fines ilícitos, para cargar información de personas sin su consentimiento, para intentar acceder a datos de otros consultorios, para vulnerar la seguridad de la plataforma ni para revender el servicio sin autorización.</p>

      <h2>6. Planes, prueba y pagos</h2>
      <ul>
        <li>Los planes se distinguen por el número de pacientes activos. Todas las funciones están incluidas en todos los planes, con el tope mensual de uso de IA que indica cada uno.</li>
        <li>La prueba gratuita dura 14 días y no requiere tarjeta. Al terminar, puedes consultar tu información pero no agregar pacientes activos ni usar la IA hasta contratar un plan.</li>
        <li>Los precios se muestran en pesos mexicanos e incluyen IVA. El cobro es mensual, por adelantado, con tarjeta, a través de Stripe. Si te suscribes durante la prueba, el primer cobro se hace al terminar la prueba.</li>
        <li>La suscripción se renueva automáticamente cada mes con tu consentimiento expreso al contratarla. Te avisaremos con al menos 5 días naturales de anticipación antes de cada cobro.</li>
        <li>Si subes de plan, se cobra en ese momento la parte proporcional del resto del periodo; si bajas, la diferencia se abona a tu siguiente cobro.</li>
        <li>Si un cobro es rechazado, lo reintentaremos durante algunos días y te avisaremos por correo. Si no se logra, la suscripción se marca como vencida: podrás consultar y exportar tu información, pero no agregar pacientes ni usar la IA.</li>
        <li>Emitimos un CFDI 4.0 por cada pago con los datos fiscales que captures en Suscripción. Si no los capturas a tiempo, puedes solicitarla después desde la misma pantalla.</li>
        <li>Si cambiamos el precio de tu plan, te avisaremos con al menos 30 días naturales de anticipación y podrás cancelar antes de que aplique.</li>
        <li>Puedes <strong>cancelar en cualquier momento</strong> desde la plataforma, sin penalización. La cancelación surte efecto al final del periodo pagado; no hay reembolsos por periodos parciales, salvo cuando la ley lo exija o por fallas del servicio imputables a VitalIA.</li>
      </ul>

      <h2>7. Tu información al terminar</h2>
      <p>
        Al cancelar podrás exportar tu información durante 30 días. Después, la información de tus pacientes se conserva bloqueada el tiempo que exija la
        ley (el expediente clínico, al menos {LEGAL.retentionYears} años desde el último acto) y luego se elimina, salvo que solicites su entrega.
      </p>

      <h2>8. Disponibilidad y cambios</h2>
      <p>
        Procuramos que el servicio esté disponible de forma continua, pero puede haber interrupciones por mantenimiento o causas ajenas. Podemos mejorar
        o modificar funciones. Si un cambio a estos términos te afecta, te avisaremos con anticipación y podrás cancelar sin penalización.
      </p>

      <h2>9. Propiedad intelectual</h2>
      <p>
        El software, la marca y los contenidos de VitalIA son de {LEGAL.company}. Tus datos y los de tus pacientes son tuyos y de ellos: no los usamos para
        fines propios ni para entrenar modelos de IA.
      </p>

      <h2>10. Limitación de responsabilidad</h2>
      <p>
        En la medida que la ley lo permita, VitalIA no responde por decisiones clínicas tomadas con apoyo de la plataforma, ni por daños indirectos. La
        responsabilidad total de VitalIA se limita al monto pagado por el servicio en los 12 meses anteriores al hecho. Nada de lo anterior limita
        los derechos que te otorga la Ley Federal de Protección al Consumidor.
      </p>

      <h2>11. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de los Estados Unidos Mexicanos. Para cualquier controversia, las partes se someten a los tribunales
        competentes de [ciudad, pendiente], sin perjuicio de la competencia de la Procuraduría Federal del Consumidor.
      </p>

      <h2 id="encargo" className="scroll-mt-6">Anexo · Contrato de encargo de datos personales</h2>
      <p>
        Este anexo regula el tratamiento que VitalIA (el «Encargado») realiza por cuenta del Nutriólogo (el «Responsable») sobre los datos personales de
        sus pacientes, incluidos datos sensibles de salud, conforme a la LFPDPPP.
      </p>
      <ol>
        <li><strong>Objeto.</strong> El Encargado trata los datos solo para prestar el servicio y conforme a las instrucciones del Responsable, expresadas a través del uso de la plataforma.</li>
        <li><strong>Finalidad limitada.</strong> El Encargado no usará los datos para fines propios, no los venderá, no los comunicará a terceros salvo a los subencargados indicados ni los usará para entrenar modelos de IA.</li>
        <li><strong>Confidencialidad.</strong> El personal del Encargado con acceso a los datos está obligado a guardar confidencialidad, aun después de terminar su relación.</li>
        <li><strong>Seguridad.</strong> El Encargado mantiene medidas administrativas, técnicas y físicas: aislamiento de cada consultorio a nivel de base de datos, control de acceso por rol, cifrado en tránsito, bitácora de accesos, respaldos y protección contra abusos.</li>
        <li>
          <strong>Subencargados.</strong> El Responsable autoriza a los proveedores listados en el <Link href="/privacidad">aviso de privacidad</Link>, que
          se ubican en Estados Unidos. El Encargado exige a cada uno obligaciones de protección equivalentes y avisará al Responsable antes de agregar o
          cambiar uno, para que pueda oponerse.
        </li>
        <li><strong>Minimización en IA.</strong> Lo que se envía al modelo de IA es lo mínimo necesario para la tarea; en el copiloto, el expediente se envía sin el nombre del paciente.</li>
        <li><strong>Vulneraciones.</strong> El Encargado avisará al Responsable sin dilación indebida de cualquier vulneración que afecte los datos de sus pacientes, con la información necesaria para que este informe a los titulares.</li>
        <li><strong>Derechos ARCO.</strong> El Encargado proporciona herramientas para recibir, dar seguimiento y responder las solicitudes de los pacientes, y apoyará al Responsable cuando lo requiera.</li>
        <li><strong>Terminación.</strong> Al terminar el servicio, el Encargado devolverá los datos al Responsable si lo solicita y, una vez cumplidos los plazos legales de conservación, los suprimirá.</li>
        <li><strong>Verificación.</strong> El Encargado pondrá a disposición del Responsable la información necesaria para demostrar el cumplimiento de este anexo.</li>
      </ol>
      <p className="text-sm text-muted">Versión {LEGAL.versions.terminos}.</p>
    </LegalDoc>
  );
}
