"use client";

import { LogOut } from "lucide-react";

import { clearBrowserQueryCache } from "@/components/admin/admin-query-provider";
import SubmitButton from "@/components/ui/submit-button";

type SignOutFormProps = {
  signOut: () => Promise<void>;
};

export function SignOutForm({ signOut }: SignOutFormProps): React.ReactNode {
  // The server action stays the form action so submit works before hydration;
  // onSubmit only clears the cache and does not preventDefault.
  function handleSubmit(): void {
    clearBrowserQueryCache();
  }

  return (
    <form action={signOut} onSubmit={handleSubmit}>
      <SubmitButton
        label="Sign out"
        pendingLabel="Signing out…"
        variant="outline"
        size="lg"
        className="w-full"
        icon={<LogOut aria-hidden="true" />}
      />
    </form>
  );
}
