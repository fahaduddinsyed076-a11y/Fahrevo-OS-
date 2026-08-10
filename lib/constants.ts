// Shared option lists. Enum-backed values mirror the database enums exactly.
// Category lists are editable suggestions only (the DB stores them as free text).

export const UNITS = ["g", "kg", "ml", "L", "pcs"] as const;
export type Unit = (typeof UNITS)[number];

export const SALES_CHANNELS = ["Direct", "B2B", "Swiggy", "Zomato", "Other"] as const;
export const PAYMENT_STATUSES = ["Unpaid", "Partial", "Paid"] as const;
export const PAYMENT_METHODS = ["Cash", "Bank", "UPI", "Other"] as const;
export const CUSTOMER_TYPES = ["B2C", "B2B"] as const;
export const SALE_STATUSES = ["draft", "confirmed", "voided"] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];
export type SalesChannel = (typeof SALES_CHANNELS)[number];

// Initial expense categories (editable — stored as text, not an enum).
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Raw Material",
  "Packaging",
  "Rent",
  "Electricity",
  "Staff",
  "Delivery",
  "Marketing",
  "Equipment",
  "Maintenance",
  "Platform Fees",
  "Miscellaneous",
] as const;
