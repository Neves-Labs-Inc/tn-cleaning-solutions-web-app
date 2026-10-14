import { AMOUNT_TOO_LARGE_MESSAGE, parseDollarsToCents } from "../pricing/money.ts";

export type JobFieldErrors = {
  name?: string;
  hourly_rate_cents?: string;
  estimated_duration_minutes?: string;
  pay_premium_cents?: string;
};

export type ParsedJobInput = {
  name: string;
  description: string | null;
  hourly_rate_cents: number;
  estimated_duration_minutes: number | null;
  pay_premium_cents: number;
};

export type JobFormResult =
  | { success: true; data: ParsedJobInput }
  | { success: false; error: string; fieldErrors: JobFieldErrors };

export const PREMIUM_INVALID_MESSAGE = "Enter a premium in dollars, like 3.00.";

export function parseJobFormData(formData: FormData): JobFormResult {
  const name = String(formData.get("name") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  const hourlyRateRaw = String(formData.get("hourly_rate_cents") ?? "");
  const durationRaw = String(formData.get("estimated_duration_minutes") ?? "").trim();
  const premiumRaw = String(formData.get("pay_premium_cents") ?? "").trim();

  const fieldErrors: JobFieldErrors = {};

  if (!name) {
    fieldErrors.name = "Name is required.";
  }

  const hourlyRate = parseDollarsToCents(hourlyRateRaw);
  if ("error" in hourlyRate) {
    fieldErrors.hourly_rate_cents =
      hourlyRate.error === "too_large"
        ? AMOUNT_TOO_LARGE_MESSAGE
        : "Enter a valid hourly rate in dollars.";
  }

  let estimatedDurationMinutes: number | null = null;
  if (durationRaw) {
    const parsedDuration = Number(durationRaw);
    if (
      Number.isNaN(parsedDuration) ||
      !Number.isFinite(parsedDuration) ||
      parsedDuration <= 0 ||
      !Number.isInteger(parsedDuration)
    ) {
      fieldErrors.estimated_duration_minutes =
        "Duration must be a whole number of minutes greater than zero.";
    } else {
      estimatedDurationMinutes = parsedDuration;
    }
  }

  // Blank means no premium; the parser refuses signs, so a negative never reaches the column.
  let payPremiumCents = 0;
  if (premiumRaw) {
    const premium = parseDollarsToCents(premiumRaw);
    if ("error" in premium) {
      fieldErrors.pay_premium_cents =
        premium.error === "too_large" ? AMOUNT_TOO_LARGE_MESSAGE : PREMIUM_INVALID_MESSAGE;
    } else {
      payPremiumCents = premium.cents;
    }
  }

  if ("error" in hourlyRate || Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      error: "Please correct the highlighted fields.",
      fieldErrors,
    };
  }

  return {
    success: true,
    data: {
      name,
      description: descriptionRaw || null,
      hourly_rate_cents: hourlyRate.cents,
      estimated_duration_minutes: estimatedDurationMinutes,
      pay_premium_cents: payPremiumCents,
    },
  };
}
