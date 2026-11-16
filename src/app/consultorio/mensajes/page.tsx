import Link from "next/link";
import { Badge, Card, Empty, fmtDateTime, PageHeader } from "@/components/ui";
import { createClient, requireRole } from "@/lib/supabase/server";

export const metadata = { title: "Mensajes" };

export default async function Inbox() {
  const s = await requireRole("nutriologo");
  const supabase = await createClient();
  const { data } = await supabase.from("messages").select("patient_id, body, created_at, read_at, sender_id, patients(full_name)")
    .order("created_at", { ascending: false }).limit(500);
  const threads = new Map<string, { name: string; last: string; at: string; unread: number }>();
  for (const m of data ?? []) {
    const t = threads.get(m.patient_id) ?? { name: (m.patients as unknown as { full_name: string } | null)?.full_name ?? "", last: m.body, at: m.created_at, unread: 0 };
    if (!m.read_at && m.sender_id !== s.userId) t.unread++;
    threads.set(m.patient_id, t);
  }
  return (
    <>
      <PageHeader title="Mensajes" subtitle="Para iniciar una conversación, abre el expediente del paciente y elige «Mensajes»." />
      <Card>
        {threads.size ? (
          <ul className="divide-y divide-border">
            {[...threads].map(([pid, t]) => (
              <li key={pid}>
                <Link href={`/consultorio/mensajes/${pid}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0"><p className="font-medium">{t.name} {t.unread > 0 && <Badge tone="primary">{t.unread}</Badge>}</p><p className="truncate text-sm text-muted">{t.last}</p></div>
                  <span className="shrink-0 text-xs text-muted">{fmtDateTime(t.at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <Empty>Sin conversaciones.</Empty>}
      </Card>
    </>
  );
}
