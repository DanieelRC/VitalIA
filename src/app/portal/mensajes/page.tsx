import { ChatThread } from "@/components/chat-thread";
import { PageHeader } from "@/components/ui";
import { sendMessage } from "@/lib/actions/messages";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Mensajes" };

export default async function PatientMessages() {
  const s = await requireRole("paciente");
  const supabase = await createClient();
  await supabase.rpc("mark_thread_read", { p_patient: s.patientId });
  const { data } = await supabase.from("messages").select("*").eq("patient_id", s.patientId!).order("created_at").limit(300);
  return (
    <>
      <PageHeader title="Mensajes con tu nutriólogo" subtitle="Para urgencias médicas llama al 911." />
      <ChatThread patientId={s.patientId!} me={s.userId} initial={data ?? []} send={sendMessage.bind(null, null)} />
    </>
  );
}
