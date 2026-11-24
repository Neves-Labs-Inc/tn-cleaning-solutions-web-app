// Relative imports: node --test runs this file without the @/ alias.
import {
  buildInvoicePdfModel,
  getInvoicePdfFilename,
  hasInvoicePdf,
} from "./invoice-pdf-model.ts";
import { renderInvoicePdf } from "./invoice-pdf.ts";
import type { InvoiceDetail } from "./queries.ts";

// The Invoice PDF download as a Response. The route handler wires the session and the database in;
// everything that decides between a file and a 404 lives here so node:test can reach it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_ROLE = "admin";

export type InvoicePdfRequest = {
  // The signed-in user's role; undefined when signed out.
  role: string | undefined;
  clientId: string;
  invoiceId: string;
  businessDate: string;
  loadDetail: (invoiceId: string) => Promise<InvoiceDetail | null>;
};

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

// An ASCII fallback in quotes plus the RFC 5987 form, so no name can end the quoted string or add a header.
export function contentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\/]/g, "_");
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

// Everything that isn't a file is the same 404: a non-admin, a bad id, another client's invoice and a
// Mark paid invoice that is still paid look alike, so the route says nothing about what exists.
export async function createInvoicePdfResponse(
  request: InvoicePdfRequest,
): Promise<Response> {
  if (request.role !== ADMIN_ROLE) return notFound();
  if (!UUID.test(request.clientId) || !UUID.test(request.invoiceId)) return notFound();

  const detail = await request.loadDetail(request.invoiceId);
  if (!detail || detail.invoice.client_id !== request.clientId) return notFound();
  if (!hasInvoicePdf(detail.invoice)) return notFound();

  const model = buildInvoicePdfModel(detail, request.businessDate);
  const pdf = await renderInvoicePdf(model);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": contentDisposition(
        getInvoicePdfFilename(detail, request.businessDate),
      ),
      "Cache-Control": "no-store",
    },
  });
}
