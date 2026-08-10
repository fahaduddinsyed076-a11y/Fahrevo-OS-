// Deterministic date-range presets (local dates, YYYY-MM-DD).

export type RangeKey = "today" | "week" | "month" | "custom";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function presetRange(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const today = iso(now);
  if (key === "today") return { from: today, to: today };
  if (key === "week") {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7; // Monday = 0
    d.setDate(d.getDate() - day);
    return { from: iso(d), to: today };
  }
  // month
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
}
