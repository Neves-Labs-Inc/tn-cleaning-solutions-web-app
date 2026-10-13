import { isCalendarDate } from "../dates/calendar.ts";

export type EmployeeFieldErrors = {
  email?: string;
  full_name?: string;
  started_at?: string;
  e_transfer_email?: string;
};

export type ParsedEmployeeUpdateInput = {
  full_name: string;
  phone: string | null;
  started_at: string | null;
  address: string | null;
  e_transfer_email: string | null;
  is_active: boolean;
};

export type EmployeeUpdateFormResult =
  | { success: true; data: ParsedEmployeeUpdateInput }
  | { success: false; error: string; fieldErrors: EmployeeFieldErrors };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmployeeUpdateFormData(
  formData: FormData,
): EmployeeUpdateFormResult {
  const fullName = String(formData.get("full_name") ?? "").trim();
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const startedAtRaw = String(formData.get("started_at") ?? "").trim();
  const addressRaw = String(formData.get("address") ?? "").trim();
  const eTransferEmailRaw = String(formData.get("e_transfer_email") ?? "")
    .trim()
    .toLowerCase();
  const isActive = formData.get("is_active") === "on";

  const fieldErrors: EmployeeFieldErrors = {};
  if (!fullName) {
    fieldErrors.full_name = "Full name is required.";
  }
  if (startedAtRaw && !isCalendarDate(startedAtRaw)) {
    fieldErrors.started_at = "Enter a valid date.";
  }
  if (eTransferEmailRaw && !EMAIL_PATTERN.test(eTransferEmailRaw)) {
    fieldErrors.e_transfer_email = "Enter a valid email address.";
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
        e_transfer_email: eTransferEmailRaw || null,
        is_active: isActive,
      },
    };
  }
  return result;
}
