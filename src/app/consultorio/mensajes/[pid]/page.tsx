import Link from "next/link";
import { ChatThread } from "@/components/chat-thread";
import { PageHeader } from "@/components/ui";
import { sendMessage } from "@/lib/actions/messages";
import { getPatient } from "@/lib/data";
import { createClient, requireRole } from "@/lib/supabase/server";

export default async function Thread({ params }: { params: Promise<{ pid: string }> }) {
  const { pid } = await params;
  const s = await requireRole("nutriologo");
  const p = await getPatient(pid);
  const supabase = await createClient();
  await supabase.rpc("mark_thread_read", { p_patient: pid });
  const { data } = await supabase.from("messages").select("*").eq("patient_id", pid).order("created_at").limit(300);
  return (
    <>
      <PageHeader title={p.full_name} subtitle={<Link href={`/consultorio/pacientes/${pid}`} className="text-primary">Ver expediente</Link>} />
      <ChatThread patientId={pid} me={s.userId} initial={data ?? []} send={sendMessage.bind(null, pid)} />
    </>
  );
}
