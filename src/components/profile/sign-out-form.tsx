"use client";

import { LogOut } from "lucide-react";

import { clearBrowserQueryCache } from "@/components/admin/admin-query-provider";
import SubmitButton from "@/components/ui/submit-button";

type SignOutFormProps = {
  signOut: () => Promise<void>;
};

export function SignOutForm({ signOut }: SignOutFormProps): React.ReactNode {
  async function handleSignOut(): Promise<void> {
    clearBrowserQueryCache();
    await signOut();
  }

  return (
    <form action={handleSignOut}>
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
