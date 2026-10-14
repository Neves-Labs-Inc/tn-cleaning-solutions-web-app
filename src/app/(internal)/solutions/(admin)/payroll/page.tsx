import PayPeriodsList from "@/components/admin/payroll/pay-periods-list";
import PageHeader from "@/components/ui/page-header";
import { summarizePeriods } from "@/lib/payroll/period-summary";
import { fetchPayPeriodsOverview } from "@/lib/payroll/queries";
import { createClient } from "@/lib/supabase/server";

export default async function PayPeriodsPage(): Promise<React.ReactNode> {
  const now = new Date();
  const db = await createClient();
  const overview = await fetchPayPeriodsOverview(db, now);
  const { rows } = summarizePeriods(overview, now);

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        title="Pay periods"
        description="Two-week periods, Monday to Sunday. Newest first."
      />
      <div className="animate-in duration-slow fade-in-0">
        <PayPeriodsList rows={rows} />
      </div>
    </div>
  );
}
