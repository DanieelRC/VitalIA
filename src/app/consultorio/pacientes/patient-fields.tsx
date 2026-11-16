import { Field, Input, Select, Textarea } from "@/components/ui";
import type { Patient } from "@/lib/data";

export function PatientFields({ p }: { p?: Partial<Patient> }) {
  const ls = p?.lifestyle ?? {};
  return (
    <div className="grid gap-4">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Datos generales</legend>
        <Field label="Nombre completo"><Input name="full_name" defaultValue={p?.full_name} required /></Field>
        <Field label="Correo" hint="Se usa para la invitación y el acceso al portal"><Input name="email" type="email" defaultValue={p?.email} required /></Field>
        <Field label="Teléfono"><Input name="phone" defaultValue={p?.phone ?? ""} /></Field>
        <Field label="Fecha de nacimiento"><Input name="birth_date" type="date" defaultValue={p?.birth_date ?? ""} /></Field>
        <Field label="Sexo">
          <Select name="sex" defaultValue={p?.sex ?? ""}>
            <option value="">—</option><option value="F">Femenino</option><option value="M">Masculino</option>
          </Select>
        </Field>
        <Field label="Ocupación"><Input name="occupation" defaultValue={p?.occupation ?? ""} /></Field>
        <Field label="Motivo / objetivo" className="sm:col-span-2"><Input name="goal" defaultValue={p?.goal ?? ""} /></Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Antecedentes clínicos</legend>
        <Field label="Patologías" hint="Separadas por coma"><Input name="pathologies" defaultValue={p?.pathologies?.join(", ")} /></Field>
        <Field label="Alergias e intolerancias" hint="Separadas por coma"><Input name="allergies" defaultValue={p?.allergies?.join(", ")} /></Field>
        <Field label="Medicamentos y suplementos actuales" className="sm:col-span-2"><Textarea name="medications" defaultValue={p?.medications ?? ""} rows={2} /></Field>
        <Field label="Antecedentes personales patológicos"><Textarea name="personal_history" defaultValue={p?.personal_history ?? ""} rows={3} /></Field>
        <Field label="Antecedentes heredofamiliares"><Textarea name="family_history" defaultValue={p?.family_history ?? ""} rows={3} /></Field>
        <Field label="Antecedentes gineco-obstétricos" className="sm:col-span-2"><Textarea name="gyneco_history" defaultValue={p?.gyneco_history ?? ""} rows={2} /></Field>
      </fieldset>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-semibold">Estilo de vida</legend>
        <Field label="Actividad física"><Input name="ls_actividad" defaultValue={ls.actividad} /></Field>
        <Field label="Horas de sueño"><Input name="ls_sueno" defaultValue={ls.sueno} /></Field>
        <Field label="Consumo de agua"><Input name="ls_agua" defaultValue={ls.agua} /></Field>
        <Field label="Alcohol"><Input name="ls_alcohol" defaultValue={ls.alcohol} /></Field>
        <Field label="Tabaco"><Input name="ls_tabaco" defaultValue={ls.tabaco} /></Field>
        <Field label="Estrés"><Input name="ls_estres" defaultValue={ls.estres} /></Field>
        <Field label="Historia dietética (hábitos, preferencias, aversiones, horarios)" className="sm:col-span-3">
          <Textarea name="diet_history" defaultValue={p?.diet_history ?? ""} rows={3} />
        </Field>
      </fieldset>
    </div>
  );
}
