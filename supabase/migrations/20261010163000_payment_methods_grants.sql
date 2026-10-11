-- authenticated keeps only SELECT, INSERT and UPDATE on payment_methods.
--
-- 20261009130000 granted ALL, but the RLS policies only ever allow an admin to select, insert and
-- update, and the app never deletes a method (it hides one). DELETE, TRUNCATE, REFERENCES and
-- TRIGGER were unused, and TRUNCATE skips RLS. service_role and the policies are unchanged;
-- invoice_record_payment adds a new method as its SECURITY DEFINER owner, so it is unaffected.
--
-- DOWN:
--   GRANT ALL ON TABLE "public"."payment_methods" TO "authenticated";

REVOKE ALL ON TABLE "public"."payment_methods" FROM "authenticated";
GRANT SELECT, INSERT, UPDATE ON TABLE "public"."payment_methods" TO "authenticated";
