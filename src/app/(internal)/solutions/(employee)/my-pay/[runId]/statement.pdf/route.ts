import {
  buildPayStatementModel,
  getPayStatementFilename,
  renderPayStatementPdf,
} from "@/lib/payroll/pay-statement";
import { fetchMyPaidRuns } from "@/lib/payroll/queries";
import { createClient } from "@/lib/supabase/server";

// The signed-in Cleaner's Pay statement for one of her paid runs, as a PDF download. Route Handlers
// skip the employee layout. The run is read through the My pay views, which return only the caller's
// own paid runs, so another Cleaner's run, an unpaid run, a bad id and an admin all find nothing
// and get the same 404. Never cached: a statement should always reflect the run as it stands.

type StatementRouteContext = { params: Promise<{ runId: string }> };

function notFound(): Response {
  return new Response("Not found", { status: 404 });
}

export async function GET(
  _request: Request,
  context: StatementRouteContext,
): Promise<Response> {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return notFound();

  const { runId } = await context.params;
  const paidRuns = await fetchMyPaidRuns(db);
  const run = paidRuns.runs.find((candidate) => candidate.id === runId);
  if (!run) return notFound();

  const { data: employee } = await db
    .from("employees")
    .select("full_name")
    .eq("user_id", user.id)
    .single<{ full_name: string }>();
  if (!employee) return notFound();

  const model = buildPayStatementModel({
    cleanerName: employee.full_name,
    run,
    lines: paidRuns.lines.filter((line) => line.pay_run_id === run.id),
    adjustments: paidRuns.adjustments.filter(
      (adjustment) => adjustment.pay_run_id === run.id,
    ),
  });
  const pdf = await renderPayStatementPdf(model);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${getPayStatementFilename(run)}"`,
      "Cache-Control": "no-store",
    },
  });
}
