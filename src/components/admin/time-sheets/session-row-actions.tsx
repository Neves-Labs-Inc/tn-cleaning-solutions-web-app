import { cn } from "@/lib/utils";

type SessionRowActionsProps = {
  layout: "table" | "card";
  children?: React.ReactNode;
};

// The shared slot for a session's action buttons. Children gate themselves, so with none it
// collapses (`empty:hidden`). Order matters: Acknowledge (outline) first, then the fix button
// (ticket 07), so the sometimes-primary fix button stays rightmost.
export default function SessionRowActions({
  layout,
  children,
}: SessionRowActionsProps): React.ReactNode {
  return (
    <div
      className={cn(
        "flex flex-wrap gap-2 empty:hidden",
        layout === "table" ? "justify-end" : "*:flex-1",
      )}
    >
      {children}
    </div>
  );
}
