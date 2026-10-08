import { MAX_CAR_DAILY_PRICE, type Cents } from "@rt/sim";

export type ParseEurosResult =
  | { readonly ok: true; readonly cents: Cents }
  | { readonly ok: false; readonly reason: "format" | "range" };

const EUROS_PATTERN = /^(\d{1,7})(?:[.,](\d{1,2}))?$/;

/** Parse a player-typed euro amount into integer cents, using string operations only. */
export function parseEurosToCents(input: string): ParseEurosResult {
  if (typeof input !== "string") return { ok: false, reason: "format" };
  const match = EUROS_PATTERN.exec(input.trim());
  if (!match) return { ok: false, reason: "format" };
  const whole = match[1] ?? "";
  const decimals = (match[2] ?? "").padEnd(2, "0");
  // At most 7 + 2 digits, always a safe integer.
  const cents = Number(whole + decimals);
  if (!Number.isSafeInteger(cents)) return { ok: false, reason: "format" };
  if (cents > MAX_CAR_DAILY_PRICE) return { ok: false, reason: "range" };
  return { ok: true, cents };
}

/** Format cents as an editable euro string such as "60,00"; "" when not a non-negative safe integer. */
export function formatCentsForInput(cents: Cents): string {
  if (!Number.isSafeInteger(cents) || cents < 0) return "";
  const digits = String(cents).padStart(3, "0");
  return `${digits.slice(0, -2)},${digits.slice(-2)}`;
}
