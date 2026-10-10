"use client";

import { useRouter } from "next/navigation";
import { CircleAlert, Phone, UsersRound } from "lucide-react";

import CrewAdminNotes from "@/components/admin/crew-admin-notes";
import ClockCorrectionForm from "@/components/admin/time-sheets/clock-correction-form";
import ClockFixButton from "@/components/admin/time-sheets/clock-fix-button";
import { PRESS_FEEDBACK } from "@/components/admin/time-sheets/clock-form-footer";
import SessionCard from "@/components/admin/time-sheets/session-card";
import {
  getFixButtonId,
  getFixPanelId,
} from "@/components/admin/time-sheets/session-panel-ids";
import SessionRowActions from "@/components/admin/time-sheets/session-row-actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useCrewPanels } from "@/hooks/use-crew-panels";
import type { CrewMemberView } from "@/lib/time-sheets/crew-views";
import { cn } from "@/lib/utils";

type AppointmentCrewClocksProps = {
  members: CrewMemberView[];
  // The crew's clocks and history failed to read; the rest of the page still renders.
  hasLoadError: boolean;
};

type PhoneLinkProps = {
  phone: string | null;
};

const TEL_UNSAFE_CHARACTERS = /[^\d+]/g;

function PhoneLink({ phone }: PhoneLinkProps): React.ReactNode {
  if (!phone) {
    return <p className="text-sm text-muted-foreground">No phone on file</p>;
  }

  return (
    <a
      href={`tel:${phone.replace(TEL_UNSAFE_CHARACTERS, "")}`}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        PRESS_FEEDBACK,
        "-ml-3 w-fit active:bg-muted",
      )}
    >
      <Phone aria-hidden="true" />
      {phone}
    </a>
  );
}

function CrewLoadError(): React.ReactNode {
  const router = useRouter();

  return (
    <div className="border-t p-4 sm:p-5">
      <Alert variant="destructive">
        <CircleAlert aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load clock details</AlertTitle>
        <AlertDescription>
          The crew&apos;s clocks and history didn&apos;t load.
        </AlertDescription>
        <div className="col-start-2 mt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.refresh()}
            className={cn(PRESS_FEEDBACK, "active:bg-muted md:hover:bg-muted")}
          >
            Try again
          </Button>
        </div>
      </Alert>
    </div>
  );
}

function EmptyCrew(): React.ReactNode {
  return (
    <Empty className="rounded-none border-t border-solid">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersRound aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No employees are assigned to this appointment.</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}

// The appointment page's crew: one card per live Cleaner, built from the drill-down's session
// card, badges, history and fix form in their card layout at every width.
export default function AppointmentCrewClocks({
  members,
  hasLoadError,
}: AppointmentCrewClocksProps): React.ReactNode {
  const panels = useCrewPanels();

  if (hasLoadError) return <CrewLoadError />;
  if (members.length === 0) return <EmptyCrew />;

  return (
    <ul className="divide-y border-t">
      {members.map(({ session, name, phone, adminNotes }) => {
        const isFixOpen = panels.isOpen(session.id, "fix");
        return (
          <SessionCard
            key={session.id}
            view={session}
            heading={{ title: name, detail: <PhoneLink phone={phone} /> }}
            isHistoryOpen={panels.isOpen(session.id, "history")}
            onToggleHistory={() => panels.toggle(session.id, "history")}
            actions={
              <SessionRowActions layout="card">
                <ClockFixButton
                  view={session}
                  layout="card"
                  id={getFixButtonId(session.id, "card")}
                  expanded={isFixOpen}
                  controlsId={getFixPanelId(session.id, "card")}
                  onOpen={() => panels.toggle(session.id, "fix")}
                />
              </SessionRowActions>
            }
            panel={
              isFixOpen && session.fixAction ? (
                <ClockCorrectionForm
                  layout="card"
                  view={session}
                  mode={session.fixAction}
                  id={getFixPanelId(session.id, "card")}
                  onClose={() => panels.closeFix(session.id)}
                />
              ) : undefined
            }
            footer={
              <CrewAdminNotes
                assignmentId={session.id}
                initialNotes={adminNotes}
              />
            }
          />
        );
      })}
    </ul>
  );
}
