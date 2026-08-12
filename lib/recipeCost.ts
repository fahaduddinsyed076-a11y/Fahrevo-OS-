import { convertToUnit } from "./units";
import type { Unit } from "./constants";

export type RecipeCostLine = {
  ingredient_id: string;
  quantity_required: number;
  unit: Unit;
};

export type IngredientCostInfo = {
  base_unit: Unit;
  current_cost_per_base_unit: number | null;
};

// Estimated recipe cost = Σ (normalized quantity_required × cost/base unit).
// Wastage is intentionally excluded from this estimate — it reflects the base
// recipe requirement, not actual consumption. Includes every recipe line
// (food and packaging alike, whatever ingredients are configured).
// Returns null when there are no lines, or any required ingredient cost or
// unit conversion is missing — never invented.
export function estimateRecipeCost(
  lines: RecipeCostLine[],
  ingredientById: Record<string, IngredientCostInfo | undefined>,
): number | null {
  if (lines.length === 0) return null;
  let total = 0;
  for (const line of lines) {
    const ing = ingredientById[line.ingredient_id];
    if (!ing || ing.current_cost_per_base_unit == null) return null;
    const normalized = convertToUnit(line.quantity_required, line.unit, ing.base_unit);
    if (normalized == null) return null;
    total += normalized * ing.current_cost_per_base_unit;
  }
  return total;
}
