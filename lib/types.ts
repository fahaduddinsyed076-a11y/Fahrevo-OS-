// Hand-written row types for the tables used in this milestone.
// (Full generated types can replace these later via `supabase gen types`.)

import type { Unit } from "./constants";

export type Product = {
  id: string;
  product_name: string;
  sku: string | null;
  category: string | null;
  selling_price: number | null;
  b2b_price: number | null;
  b2c_price: number | null;
  unit: string | null;
  active_status: boolean;
  created_at: string;
  updated_at: string;
};

export type Ingredient = {
  id: string;
  ingredient_name: string;
  sku: string | null;
  category: string | null;
  base_unit: Unit;
  current_cost_per_base_unit: number | null;
  minimum_stock_level: number | null;
  active_status: boolean;
  created_at: string;
  updated_at: string;
};
