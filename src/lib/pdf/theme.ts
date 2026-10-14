import { Font, StyleSheet } from "@react-pdf/renderer";

// The PDFs' print theme (Payroll summary, Pay statement): DESIGN.md's light tokens as hex, since
// a PDF can't read CSS variables. These are the only colors a PDF uses.

export const PDF_COLORS = {
  // --primary, same hex as NextTopLoader.
  primary: "#008235",
  // --primary-foreground.
  onPrimary: "#ffffff",
  // --foreground.
  text: "#0a0a0a",
  // --muted-foreground.
  muted: "#737373",
  // --border.
  border: "#e5e5e5",
} as const;

// Built-in fonts: nothing to register or bundle, and the digits are equal-width so numbers line up.
export const PDF_FONTS = {
  regular: "Helvetica",
  bold: "Helvetica-Bold",
} as const;

// Long text wraps at spaces only: a name split as "Oliv-eira" would read as a hyphenated surname.
// Global to react-pdf, so every PDF the app renders gets it.
Font.registerHyphenationCallback((word) => [word]);

export const PDF_SPACING = {
  page: 36,
  footerFromEdge: 24,
  headerToTable: 16,
  cellX: 4,
  rowY: 4,
  headRowY: 5,
} as const;

const FONT_SIZE = {
  brand: 16,
  title: 12,
  meta: 9,
  table: 9,
  footer: 8,
  subLine: 8,
} as const;

export const PDF_STYLES = StyleSheet.create({
  page: {
    padding: PDF_SPACING.page,
    fontFamily: PDF_FONTS.regular,
    fontSize: FONT_SIZE.table,
    color: PDF_COLORS.text,
  },
  header: {
    marginBottom: PDF_SPACING.headerToTable,
  },
  brand: {
    fontFamily: PDF_FONTS.bold,
    fontSize: FONT_SIZE.brand,
    color: PDF_COLORS.primary,
  },
  title: {
    fontFamily: PDF_FONTS.bold,
    fontSize: FONT_SIZE.title,
    marginTop: 6,
  },
  meta: {
    fontSize: FONT_SIZE.meta,
    color: PDF_COLORS.muted,
    marginTop: 2,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: PDF_COLORS.primary,
    color: PDF_COLORS.onPrimary,
    fontFamily: PDF_FONTS.bold,
    paddingVertical: PDF_SPACING.headRowY,
  },
  // Cells top-align so numbers sit on a wrapped name's first line.
  tableRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: PDF_SPACING.rowY,
    borderBottomWidth: 0.5,
    borderBottomColor: PDF_COLORS.border,
  },
  tableTotal: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: PDF_SPACING.headRowY,
    borderTopWidth: 1,
    borderTopColor: PDF_COLORS.text,
    fontFamily: PDF_FONTS.bold,
  },
  cell: {
    paddingHorizontal: PDF_SPACING.cellX,
  },
  // A cell's second line (e.g. the shift an Adjustment points at).
  subLine: {
    fontSize: FONT_SIZE.subLine,
    color: PDF_COLORS.muted,
    marginTop: 1,
  },
  mutedCell: {
    color: PDF_COLORS.muted,
  },
  footer: {
    position: "absolute",
    bottom: PDF_SPACING.footerFromEdge,
    right: PDF_SPACING.page,
    fontSize: FONT_SIZE.footer,
    color: PDF_COLORS.muted,
  },
});
