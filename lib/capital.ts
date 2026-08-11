// Shared "available capital" math — used by both the Dashboard and the Cash
// Flow page so the two never compute this differently.
//
// Available capital per method = opening balance + payments RECEIVED
// (direction='received') − payments PAID (direction='paid'), sourced only
// from confirmed payment rows. Revenue/receivables and purchases/payables do
// NOT move this figure until an actual payment is recorded — a credit sale
// or credit purchase has zero cash effect until money actually moves.

import { PAYMENT_METHODS } from "./constants";
import type { AppSettings } from "./types";

export type PaymentForCapital = {
  direction: string;
  payment_method: string;
  amount: number;
};

export type CapitalRow = {
  method: string;
  opening: number | null;
  receipts: number;
  payments: number;
  balance: number | null;
};

export type CapitalSummary = {
  rows: CapitalRow[];
  totalBalance: number;
  /** true only if every payment method has a configured opening balance. */
  totalKnown: boolean;
  anyConfigured: boolean;
};

function openingFor(settings: AppSettings | null, method: string): number | null {
  if (!settings) return null;
  if (method === "Cash") return settings.opening_cash;
  if (method === "Bank") return settings.opening_bank;
  if (method === "UPI") return settings.opening_upi;
  return settings.opening_other;
}

export function computeCapital(
  settings: AppSettings | null,
  payments: PaymentForCapital[],
): CapitalSummary {
  const sum = (direction: string, method: string) =>
    payments
      .filter((p) => p.direction === direction && p.payment_method === method)
      .reduce((s, p) => s + Number(p.amount), 0);

  let totalBalance = 0;
  let totalKnown = true;

  const rows: CapitalRow[] = PAYMENT_METHODS.map((method) => {
    const opening = openingFor(settings, method);
    const receipts = sum("received", method);
    const paid = sum("paid", method);
    const balance = opening == null ? null : opening + receipts - paid;
    if (balance == null) totalKnown = false;
    else totalBalance += balance;
    return { method, opening, receipts, payments: paid, balance };
  });

  return {
    rows,
    totalBalance,
    totalKnown,
    anyConfigured: rows.some((r) => r.opening != null),
  };
}

/** Just the Bank-method balance, for a focused "bank balance" figure. */
export function bankBalance(settings: AppSettings | null, payments: PaymentForCapital[]): number | null {
  const opening = openingFor(settings, "Bank");
  if (opening == null) return null;
  const receipts = payments.filter((p) => p.direction === "received" && p.payment_method === "Bank").reduce((s, p) => s + Number(p.amount), 0);
  const paid = payments.filter((p) => p.direction === "paid" && p.payment_method === "Bank").reduce((s, p) => s + Number(p.amount), 0);
  return opening + receipts - paid;
}
