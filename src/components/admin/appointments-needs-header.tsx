import type { AppointmentsView } from "@/lib/appointments/overview";

export type AppointmentsNeedsView = Extract<
  AppointmentsView,
  "needs-billing" | "needs-completion"
>;

const COPY: Record<AppointmentsNeedsView, { title: string; description: string }> = {
  "needs-billing": {
    title: "Needs billing",
    description: "All months, oldest first. Pick appointments of one client.",
  },
  "needs-completion": {
    title: "Needs completion",
    description:
      "All months, oldest first. Past appointments nobody clocked into.",
  },
};

interface AppointmentsNeedsHeaderProps {
  view: AppointmentsNeedsView;
}

// Shared by the loaded Needs views and their skeleton so the two never differ in height.
export default function AppointmentsNeedsHeader({
  view,
}: AppointmentsNeedsHeaderProps): React.ReactNode {
  const { title, description } = COPY[view];

  return (
    <div className="space-y-1 border-b px-4 py-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
