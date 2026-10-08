const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });

export function formatCents(cents: number): string {
  if (!Number.isFinite(cents)) return "—";
  return eur.format(Math.trunc(cents) / 100);
}
