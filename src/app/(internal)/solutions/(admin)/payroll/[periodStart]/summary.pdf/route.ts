import { buildPayrollExportModel } from "@/lib/payroll/export-model";
import { parsePeriodParam } from "@/lib/payroll/period";
import { fetchPayPeriodData, fetchPayRatesUpTo } from "@/lib/payroll/queries";
import { renderPayrollSummaryPdf } from "@/lib/payroll/summary-pdf";
import { createClient } from "@/lib/supabase/server";

// The period's Payroll summary as a PDF download, from the same export model as the .xlsx, so the
// totals match. Route Handlers skip the admin layout, so this repeats its role check; RLS on the
// pay tables is the real gate. Never cached: a re-download must reflect runs finalized or paid
// since. @react-pdf/renderer is on Next's built-in serverExternalPackages list.

type SummaryRouteContext = { params: Promise<{ periodStart: string }> };

export async function GET(
  _request: Request,
  context: SummaryRouteContext,
): Promise<Response> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (user?.app_metadata?.role !== "admin") {
    console.warn("payroll summary: refused, not an admin", user?.id ?? null);
    return new Response("Forbidden", { status: 403 });
  }

  const { periodStart } = await context.params;
  const period = parsePeriodParam(periodStart, new Date());
  if (period === null) return new Response("Not found", { status: 404 });

  const [data, payRates] = await Promise.all([
    fetchPayPeriodData(db, period.start),
    fetchPayRatesUpTo(db, period.end),
  ]);
  const model = buildPayrollExportModel(data, period, payRates);
  if (model.cleaners.length === 0) {
    return new Response("Not found", { status: 404 });
  }

  const pdf = await renderPayrollSummaryPdf(model);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="payroll-summary-${period.start}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
