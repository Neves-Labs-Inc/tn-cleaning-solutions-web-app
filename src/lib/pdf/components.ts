import { createElement as h, type ReactElement, type ReactNode } from "react";
import { Page, Text, View } from "@react-pdf/renderer";

// Relative import: node --test runs this file without the @/ alias.
import { PDF_STYLES } from "./theme.ts";

// The building blocks every PDF shares (Payroll summary, Pay statement). createElement rather
// than JSX: node --test can't load .tsx, and the renderers are tested there.

export const BUSINESS_NAME = "TN Cleaning Solutions";

export type PdfColumn = {
  label: string;
  widthPct: number;
  align: "left" | "right";
};

type PdfPageProps = { children: ReactNode };

type PdfHeaderProps = { title: string; metaLine: string };

// Plain text, or text with a muted second line and/or a muted whole cell.
export type PdfCell = string | { text: string; sub?: string; muted?: boolean };

type PdfTableProps = {
  columns: PdfColumn[];
  rows: PdfCell[][];
  totalRow?: PdfCell[];
};

type PageNumbers = { pageNumber: number; totalPages: number };

function formatPageNumbers({ pageNumber, totalPages }: PageNumbers): string {
  return `Page ${pageNumber} of ${totalPages}`;
}

// A US Letter portrait page with the "Page X of Y" footer on every page.
export function PdfPage({ children }: PdfPageProps): ReactElement {
  return h(
    Page,
    { size: "LETTER", style: PDF_STYLES.page },
    children,
    h(Text, { fixed: true, style: PDF_STYLES.footer, render: formatPageNumbers }),
  );
}

export function PdfHeader({ title, metaLine }: PdfHeaderProps): ReactElement {
  return h(
    View,
    { style: PDF_STYLES.header },
    h(Text, { style: PDF_STYLES.brand }, BUSINESS_NAME),
    h(Text, { style: PDF_STYLES.title }, title),
    h(Text, { style: PDF_STYLES.meta }, metaLine),
  );
}

function renderCells(columns: PdfColumn[], cells: PdfCell[]): ReactElement[] {
  return columns.map((column, index) => {
    const cell = cells[index] ?? "";
    const { text, sub, muted } =
      typeof cell === "string" ? { text: cell, sub: undefined, muted: false } : cell;
    return h(
      Text,
      {
        style: [
          PDF_STYLES.cell,
          { width: `${column.widthPct}%`, textAlign: column.align },
          muted ? PDF_STYLES.mutedCell : {},
        ],
      },
      text,
      sub === undefined ? null : h(Text, { style: PDF_STYLES.subLine }, `\n${sub}`),
    );
  });
}

// The header row repeats on every page and no row splits across pages. The last body row and the
// total share one unbreakable block, so the total never sits alone at the top of a page.
export function PdfTable({
  columns,
  rows,
  totalRow,
}: PdfTableProps): ReactElement {
  const labels: PdfCell[] = columns.map((column) => column.label);
  const bodyRows = rows.map((cells) =>
    h(
      View,
      { style: PDF_STYLES.tableRow, wrap: false },
      ...renderCells(columns, cells),
    ),
  );
  const lastRow = totalRow === undefined ? [] : bodyRows.slice(-1);
  const leadingRows = totalRow === undefined ? bodyRows : bodyRows.slice(0, -1);
  const ending =
    totalRow === undefined
      ? null
      : h(
          View,
          { wrap: false },
          ...lastRow,
          h(View, { style: PDF_STYLES.tableTotal }, ...renderCells(columns, totalRow)),
        );

  return h(
    View,
    null,
    h(View, { fixed: true, style: PDF_STYLES.tableHead }, ...renderCells(columns, labels)),
    ...leadingRows,
    ending,
  );
}
