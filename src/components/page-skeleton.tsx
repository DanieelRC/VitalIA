/** Esqueleto de carga genérico: título, fila de datos y dos bloques. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="grid gap-4">
      <div className="skeleton h-10 w-56" />
      <div className="skeleton h-4 w-80 max-w-full" />
      <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
      </div>
      <div className="skeleton h-56" />
      <div className="skeleton h-40" />
    </div>
  );
}
