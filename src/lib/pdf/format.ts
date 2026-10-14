// Relative imports: node --test runs this file without the @/ alias.
import { formatCents, formatRate, UNPRICED_LABEL } from "../pricing/money.ts";

// Number formats the PDFs share (Payroll summary, Pay statement). Plain hyphen-minus for a
// deduction: the built-in Helvetica has no U+2212 glyph.

const signedCadFormatter = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  signDisplay: "exceptZero",
});

// 3000 -> "+$30.00", -1500 -> "-$15.00", 0 -> "$0.00".
export function formatSignedCad(cents: number): string {
  return signedCadFormatter.format(cents / 100);
}

// 2400 -> "$24.00/h", null -> "—".
export function formatOptionalRate(cents: number | null): string {
  return cents === null ? UNPRICED_LABEL : formatRate(cents);
}

export { formatCents as formatCad };
