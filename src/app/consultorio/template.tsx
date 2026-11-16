// Se vuelve a montar en cada navegación: una sola entrada suave por página.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-enter">{children}</div>;
}
