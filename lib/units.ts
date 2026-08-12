// Client-side mirror of the database's deterministic unit logic.
// Used for validation + display estimates only; the database remains the
// authority for stored consumption quantities and COGS.

import type { Unit } from "./constants";

export const UNIT_FACTOR: Record<Unit, number> = {
  g: 1,
  kg: 1000,
  ml: 1,
  L: 1000,
  pcs: 1,
};

export function unitGroup(u: Unit): "mass" | "volume" | "count" {
  if (u === "g" || u === "kg") return "mass";
  if (u === "ml" || u === "L") return "volume";
  return "count";
}

export function unitsCompatible(a: Unit, b: Unit): boolean {
  return unitGroup(a) === unitGroup(b);
}

// Convert qty from one unit to a compatible unit; null if incompatible.
export function convertToUnit(q: number, from: Unit, to: Unit): number | null {
  if (!unitsCompatible(from, to)) return null;
  return (q * UNIT_FACTOR[from]) / UNIT_FACTOR[to];
}
