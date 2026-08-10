// Display-only formatting helpers. Never used to derive stored values.

export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Quantity with up to 3 decimals, trailing zeros trimmed.
export function qty(n: number | null | undefined): string {
  if (n == null || Number.isNaN(Number(n))) return "—";
  const s = Number(n).toFixed(3);
  return s.replace(/\.?0+$/, "");
}

export function dateShort(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
