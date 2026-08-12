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

export type Customer = {
  id: string;
  customer_name: string;
  customer_type: "B2C" | "B2B";
  active_status: boolean;
};

export type Recipe = {
  id: string;
  product_id: string;
  ingredient_id: string;
  quantity_required: number;
  unit: Unit;
  wastage_percentage: number;
};

export type SaleStatus = "draft" | "confirmed" | "voided";
export type PaymentStatus = "Unpaid" | "Partial" | "Paid";

// View: public.sale_financials
export type SaleFinancial = {
  sale_id: string;
  sale_number: string;
  sale_date: string;
  status: SaleStatus;
  sales_channel: string;
  customer_id: string | null;
  subtotal: number;
  discount: number;
  tax: number;
  final_amount: number;
  payment_status: PaymentStatus;
  amount_received: number;
  receivable: number;
  cogs: number | null;
};

// View: public.sale_item_financials
export type SaleItemFinancial = {
  sale_item_id: string;
  sale_id: string;
  sale_date: string;
  status: SaleStatus;
  sales_channel: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount: number;
  revenue: number;
  has_recipe: boolean;
  line_cogs: number | null;
};

export type Supplier = {
  id: string;
  supplier_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  payment_terms: string | null;
  active_status: boolean;
  notes: string | null;
};

export type PurchaseStatus = "draft" | "received" | "void";

// View: public.purchase_financials
export type PurchaseFinancial = {
  purchase_id: string;
  purchase_number: string;
  purchase_date: string;
  status: PurchaseStatus;
  supplier_id: string | null;
  subtotal: number;
  tax: number;
  final_amount: number;
  payment_status: PaymentStatus;
  amount_paid: number;
  payable: number;
};

// View: public.expense_financials
export type ExpenseFinancial = {
  expense_id: string;
  expense_date: string;
  category: string;
  description: string | null;
  amount: number;
  status: PaymentStatus;
  amount_paid: number;
  payable: number;
};

export type AppSettings = {
  id: boolean;
  business_name: string | null;
  opening_cash: number | null;
  opening_bank: number | null;
  opening_upi: number | null;
  opening_other: number | null;
  opening_balance_date: string | null;
  expense_categories: string[];
};

// Recurring monthly fixed cost — a planning entry only. It never creates an
// expenses/payments row, so it has no direct cash effect of its own.
export type Overhead = {
  id: string;
  name: string;
  category: string;
  monthly_amount: number;
  active_status: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
