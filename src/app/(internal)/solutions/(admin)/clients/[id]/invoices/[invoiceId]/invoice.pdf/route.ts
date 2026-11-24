import { createInvoicePdfResponse } from "@/lib/invoices/invoice-pdf-response";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { getBusinessDate } from "@/lib/schedule/business-time";
import { createClient } from "@/lib/supabase/server";

// An invoice as a PDF download, admins only. Route Handlers skip the admin layout, so the role is
// checked here, and every refusal is the same 404 (see createInvoicePdfResponse). Never cached.

type InvoicePdfRouteContext = {
  params: Promise<{ id: string; invoiceId: string }>;
};

export async function GET(
  _request: Request,
  context: InvoicePdfRouteContext,
): Promise<Response> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  const { id: clientId, invoiceId } = await context.params;

  return createInvoicePdfResponse({
    role: user?.app_metadata?.role,
    clientId,
    invoiceId,
    businessDate: getBusinessDate(new Date()),
    loadDetail: (id) => getInvoiceDetail(db, id),
  });
}
