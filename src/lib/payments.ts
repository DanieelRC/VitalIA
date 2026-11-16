// Saldo de sesiones de paquetes: las que se compraron menos las consultas pagadas "con paquete".
export type Payment = { kind: string; method: string; amount: number | string; sessions: number | null };

export function packageBalance(payments: Payment[]) {
  const bought = payments.filter((p) => p.kind === "paquete").reduce((a, p) => a + (p.sessions ?? 0), 0);
  const used = payments.filter((p) => p.kind === "consulta" && p.method === "paquete").length;
  return { bought, used, left: bought - used };
}

export const totalPaid = (payments: Payment[]) => payments.reduce((a, p) => a + Number(p.amount), 0);

export const mxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);

export const METHODS: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", paquete: "Con paquete" };
export const KINDS: Record<string, string> = { consulta: "Consulta", paquete: "Paquete", otro: "Otro" };
