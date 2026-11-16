import type { ReactNode } from "react";
import { Badge, Card, Empty } from "./ui";

type Material = { id: string; title: string; category: string | null; description: string | null; body: string | null; file_path: string | null; url: string | null; published: boolean };

export function EducationList({ items, actions }: { items: Material[]; actions?: (m: Material) => ReactNode }) {
  if (!items.length) return <Empty>Sin material publicado.</Empty>;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((m) => (
        <Card key={m.id} title={<>{m.title} {!m.published && <Badge tone="warn">Oculto</Badge>}</>} actions={actions?.(m)}>
          {m.category && <Badge tone="info">{m.category}</Badge>}
          {m.description && <p className="mt-2 text-sm text-muted">{m.description}</p>}
          {m.body && <details className="mt-2 text-sm"><summary className="cursor-pointer text-primary">Leer</summary><p className="mt-2 whitespace-pre-wrap">{m.body}</p></details>}
          <div className="mt-2 flex gap-3 text-sm">
            {m.file_path && <a className="text-primary" href={`/api/education/${m.id}`} target="_blank">Descargar archivo</a>}
            {m.url && /^https?:\/\//i.test(m.url) && <a className="text-primary" href={m.url} target="_blank" rel="noopener noreferrer">Abrir enlace</a>}
          </div>
        </Card>
      ))}
    </div>
  );
}
