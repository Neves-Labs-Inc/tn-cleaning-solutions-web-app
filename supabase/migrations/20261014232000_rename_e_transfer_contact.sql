-- e-Transfer contact: employees.e_transfer_email becomes e_transfer_contact, an email or a phone
-- number (Payroll v2 spec, ticket 04). A rename keeps every stored value and the column's place;
-- the format rule lives in src/lib/employees/employee-form.ts, the only writer.
--
-- Still admin-only: employees_employee_view and private.employees_employee_view() list their
-- columns explicitly and never selected it, so a rename can't widen them. Only their comments
-- named the old column.
--
-- DOWN.
--
--   ALTER TABLE "public"."employees" RENAME COLUMN "e_transfer_contact" TO "e_transfer_email";
--   (and restore the three comments below to name e_transfer_email)

ALTER TABLE "public"."employees" RENAME COLUMN "e_transfer_email" TO "e_transfer_contact";

COMMENT ON COLUMN "public"."employees"."e_transfer_contact" IS 'Email or phone number this Cleaner receives e-Transfers at. Set only by an admin; never in employees_employee_view.';

COMMENT ON FUNCTION "private"."employees_employee_view"() IS 'Rows of employees_employee_view: active, non-archived employees, without address, default_payout_method or e_transfer_contact. Runs with definer rights because an employee''s policy on employees stops at their own row.';

COMMENT ON VIEW "public"."employees_employee_view" IS 'Employee-safe view of employees. Excludes the address, default_payout_method and e_transfer_contact columns. Runs with the caller''s rights over private.employees_employee_view(), which filters to active, non-archived employees.';
