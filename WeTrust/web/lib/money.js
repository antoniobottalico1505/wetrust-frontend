export function centsToEUR(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

export function eurToCents(eur) {
  const n = Number(String(eur).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}
