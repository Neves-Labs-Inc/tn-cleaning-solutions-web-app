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

type PdfTableProps = {
  columns: PdfColumn[];
  rows: string[][];
  totalRow?: string[];
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

function renderCells(columns: PdfColumn[], cells: string[]): ReactElement[] {
  return columns.map((column, index) =>
    h(
      Text,
      {
        style: [
          PDF_STYLES.cell,
          { width: `${column.widthPct}%`, textAlign: column.align },
        ],
      },
      cells[index] ?? "",
    ),
  );
}

// The header row repeats on every page and no row splits across pages. The last body row and the
// total share one unbreakable block, so the total never sits alone at the top of a page.
export function PdfTable({
  columns,
  rows,
  totalRow,
}: PdfTableProps): ReactElement {
  const labels = columns.map((column) => column.label);
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
