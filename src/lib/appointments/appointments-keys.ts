// The appointments screen's query keys. Every key sits under APPOINTMENTS_KEY, so one discard
// reaches them all. Dependency-free, so node:test can import it.

export const APPOINTMENTS_KEY = ["appointments"] as const;

export const appointmentsKeys = {
  week: (weekStart: string) => [...APPOINTMENTS_KEY, "week", weekStart] as const,
  needsBilling: [...APPOINTMENTS_KEY, "needs-billing"] as const,
  needsCompletion: [...APPOINTMENTS_KEY, "needs-completion"] as const,
  filterOptions: [...APPOINTMENTS_KEY, "filter-options"] as const,
  paymentMethods: [...APPOINTMENTS_KEY, "payment-methods"] as const,
};
