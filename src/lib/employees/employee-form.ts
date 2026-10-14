import { isCalendarDate } from "../dates/calendar.ts";

export type EmployeeFieldErrors = {
  email?: string;
  full_name?: string;
  started_at?: string;
  default_payout_method?: string;
  e_transfer_contact?: string;
};

export type ParsedEmployeeUpdateInput = {
  full_name: string;
  phone: string | null;
  started_at: string | null;
  address: string | null;
  default_payout_method: string | null;
  e_transfer_contact: string | null;
  is_active: boolean;
};

export type EmployeeUpdateFormResult =
  | { success: true; data: ParsedEmployeeUpdateInput }
  | { success: false; error: string; fieldErrors: EmployeeFieldErrors };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// An optional leading +, then digits, spaces, dashes and parentheses; the digits are counted apart.
const PHONE_PATTERN = /^\+?[\d\s()-]+$/;
const MIN_PHONE_DIGITS = 10;
const MAX_PHONE_DIGITS = 15;
// Matches the input's maxLength; a Payout method is a short label, not a note.
export const MAX_PAYOUT_METHOD_LENGTH = 60;

function isPhoneNumber(value: string): boolean {
  const digitCount = value.replace(/\D/g, "").length;
  return (
    PHONE_PATTERN.test(value) &&
    digitCount >= MIN_PHONE_DIGITS &&
    digitCount <= MAX_PHONE_DIGITS
  );
}

// Emails are stored lowercased, phone numbers as typed.
function normalizeETransferContact(raw: string): string {
  return EMAIL_PATTERN.test(raw) ? raw.toLowerCase() : raw;
}

function isETransferContact(value: string): boolean {
  return EMAIL_PATTERN.test(value) || isPhoneNumber(value);
}

export function parseEmployeeUpdateFormData(
  formData: FormData,
): EmployeeUpdateFormResult {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const startedAtRaw = String(formData.get("started_at") ?? "").trim();
  const addressRaw = String(formData.get("address") ?? "").trim();
  const payoutMethodRaw = String(
    formData.get("default_payout_method") ?? "",
  ).trim();
  const eTransferContactRaw = String(
    formData.get("e_transfer_contact") ?? "",
  ).trim();
  const isActive = formData.get("is_active") === "on";

  const fieldErrors: EmployeeFieldErrors = {};
  if (!fullName) {
    fieldErrors.full_name = "Full name is required.";
  }
  if (startedAtRaw && !isCalendarDate(startedAtRaw)) {
    fieldErrors.started_at = "Enter a valid date.";
  }
  if (payoutMethodRaw.length > MAX_PAYOUT_METHOD_LENGTH) {
    fieldErrors.default_payout_method = `Use ${MAX_PAYOUT_METHOD_LENGTH} characters or fewer.`;
  }
  if (eTransferContactRaw && !isETransferContact(eTransferContactRaw)) {
    fieldErrors.e_transfer_contact = "Enter an email or phone number.";
  }

  let result: EmployeeUpdateFormResult;
  if (Object.keys(fieldErrors).length > 0) {
    result = {
      success: false,
      error: "Please correct the highlighted fields.",
      fieldErrors,
    };
  } else {
    result = {
      success: true,
      data: {
        full_name: fullName,
        phone: phoneRaw || null,
        started_at: startedAtRaw || null,
        address: addressRaw || null,
        default_payout_method: payoutMethodRaw || null,
        e_transfer_contact: eTransferContactRaw
          ? normalizeETransferContact(eTransferContactRaw)
          : null,
        is_active: isActive,
      },
    };
  }
  return result;
}
