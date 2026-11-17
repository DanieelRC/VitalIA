import { ActionForm, SubmitButton } from "@/components/form";
import { Card, PageHeader } from "@/components/ui";
import { getCustomFields } from "@/lib/data";
import { createPatient } from "../actions";
import { PatientFields } from "../patient-fields";

export const metadata = { title: "Nuevo paciente" };

export default async function NewPatient() {
  const customFields = await getCustomFields();
  return (
    <>
      <PageHeader title="Nuevo paciente" subtitle="Crea el expediente y envía la invitación al portal." />
      <Card>
        <ActionForm action={createPatient}>
          <PatientFields customFields={customFields} />
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" name="send_invite" defaultChecked /> Enviar invitación por correo al portal del paciente
          </label>
          <div className="mt-4"><SubmitButton>Crear expediente</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
