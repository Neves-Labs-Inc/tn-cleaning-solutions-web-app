import { buildPayrollExportModel } from "@/lib/payroll/export-model";
import { renderPayrollWorkbook } from "@/lib/payroll/export-workbook";
import { parsePeriodParam } from "@/lib/payroll/period";
import { fetchPayPeriodData, fetchPayRatesUpTo } from "@/lib/payroll/queries";
import { createClient } from "@/lib/supabase/server";

// The period's Payroll export as an .xlsx download. Route Handlers skip the admin layout, so this
// repeats its role check; RLS on the pay tables is the real gate. Never cached: GET Route Handlers
// aren't by default, reading the session cookie keeps it per request, and no-store stops the
// browser keeping a copy, since a re-download must reflect runs finalized or paid since.

type ExportRouteContext = { params: Promise<{ periodStart: string }> };

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(
  _request: Request,
  context: ExportRouteContext,
): Promise<Response> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (user?.app_metadata?.role !== "admin") {
    console.warn("payroll export: refused, not an admin", user?.id ?? null);
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

  const workbook = await renderPayrollWorkbook(model);
  return new Response(new Uint8Array(workbook), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="payroll-${period.start}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
