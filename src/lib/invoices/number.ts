// Mirrors invoice_issue in supabase/migrations/20261009150000_invoice_issue_void_payment_archive.sql.
// SQL assigns the real number; this is for display and tests only.

const PREFIX_LENGTH = 3
const PREFIX_PAD = 'X'
const MIN_COUNT_DIGITS = 3

// Letters unaccent rewrites but NFD can't split into letter + mark.
const SPELLED_OUT: Record<string, string> = {
  Ø: 'O', ø: 'o', ß: 'ss', Æ: 'AE', æ: 'ae', Œ: 'OE', œ: 'oe', Ł: 'L', ł: 'l', Đ: 'D', đ: 'd',
}

// NFD splits an accented letter into the letter plus a combining mark, which the letters-only filter
// then drops: close to Postgres unaccent for the names a client has.
export function clientPrefix(name: string): string {
  const spelled = name.replace(/[ØøßÆæŒœŁłĐđ]/g, (letter) => SPELLED_OUT[letter])
  const letters = spelled.normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase()
  return letters.slice(0, PREFIX_LENGTH).padEnd(PREFIX_LENGTH, PREFIX_PAD)
}

export function formatInvoiceNumber(count: number, prefix: string, year: number): string {
  return `INV-${String(count).padStart(MIN_COUNT_DIGITS, '0')}-${prefix}${year}`
}
