'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { format, parseISO } from 'date-fns'
import { AlertCircle, RotateCcw } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Skeleton } from '@/components/ui/skeleton'
import { previewAppointmentScope, type ScopePreviewData } from '@/lib/actions/appointment-scopes'
import type { AppointmentScope, ScopeAction } from '@/lib/appointments/appointment-scope'

// The scope choice and live preview shared by the scoped Cancel and Delete dialogs. Each dialog
// brings only its own copy.

// Kept in sync with appointment-form.tsx's copies; a later cleanup can point the form here.
export const RADIO_CLASSES = 'mt-0.5 size-5 [&_[data-slot=radio-group-indicator]]:size-5'
export const CHOICE_ROW_CLASSES =
  '-mx-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-md px-2 py-2.5 transition-colors duration-fast active:bg-muted has-[:focus-visible]:bg-muted/50 md:hover:bg-muted/50'

const DISABLED_ROW_CLASSES = 'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'
const PREVIEW_ERROR = 'Something went wrong. Check your connection and try again.'

type ScopeRow = { value: AppointmentScope; label: string; description: (date: Date) => string }

const SCOPE_ROWS: ScopeRow[] = [
  { value: 'occurrence', label: 'This visit', description: (date) => format(date, 'EEE, MMM d') },
  {
    value: 'future',
    label: 'This and following',
    description: (date) => `From ${format(date, 'MMM d')} on, completed visits included`,
  },
  { value: 'series', label: 'Whole series', description: () => 'Every visit, past ones included' },
]

type AppointmentScopeChoiceProps = {
  value: AppointmentScope
  onValueChange: (scope: AppointmentScope) => void
  chosenDate: string
}

export function AppointmentScopeChoice({ value, onValueChange, chosenDate }: AppointmentScopeChoiceProps) {
  const headingId = useId()
  // parseISO keeps a yyyy-MM-dd date on its own day; new Date() would read it as UTC midnight.
  const date = parseISO(chosenDate)

  return (
    <div>
      <p id={headingId} className="sr-only">
        Apply to
      </p>
      <RadioGroup
        aria-labelledby={headingId}
        value={value}
        onValueChange={(scope) => onValueChange(scope as AppointmentScope)}
        className="gap-0"
      >
        {SCOPE_ROWS.map((row) => (
          <label key={row.value} className={`${CHOICE_ROW_CLASSES} ${DISABLED_ROW_CLASSES}`}>
            <RadioGroupItem value={row.value} className={RADIO_CLASSES} />
            <span className="min-w-0 space-y-0.5">
              <span className="block text-sm font-medium text-foreground">{row.label}</span>
              <span className="block text-sm text-muted-foreground">{row.description(date)}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  )
}

export type ScopePreview = {
  status: 'loading' | 'refreshing' | 'ready' | 'error'
  data: ScopePreviewData | null
  error: string | null
  // Changes with every settled request, so the slot can replay its fade-in per answer.
  dataKey: string | null
  retry: () => void
}

type PreviewState = { key: string | null; data: ScopePreviewData | null; error: string | null }

const INITIAL_STATE: PreviewState = { key: null, data: null, error: null }

type UseScopePreviewOptions = {
  appointmentId: string
  scope: AppointmentScope
  action: ScopeAction
  enabled: boolean
}

export function useScopePreview({ appointmentId, scope, action, enabled }: UseScopePreviewOptions): ScopePreview {
  const [state, setState] = useState<PreviewState>(INITIAL_STATE)
  const [attempt, setAttempt] = useState(0)
  const [wasEnabled, setWasEnabled] = useState(enabled)
  const latestRequestRef = useRef(0)
  const requestKey = `${appointmentId}|${scope}|${action}|${attempt}`

  // Reset during render when the dialog closes, so a reopen never flashes stale counts.
  if (enabled !== wasEnabled) {
    setWasEnabled(enabled)
    if (!enabled) setState(INITIAL_STATE)
  }

  useEffect(() => {
    if (!enabled) return

    // Only the latest request may settle the state, so the last scope picked always wins.
    latestRequestRef.current += 1
    const requestId = latestRequestRef.current
    previewAppointmentScope(appointmentId, scope, action)
      .then((result) => {
        if (requestId !== latestRequestRef.current) return
        setState((previous) =>
          result.success
            ? { key: requestKey, data: result.data, error: null }
            : { key: requestKey, data: previous.data, error: result.error }
        )
      })
      .catch((thrown: unknown) => {
        if (requestId !== latestRequestRef.current) return
        console.error('Scope preview failed:', thrown)
        setState((previous) => ({ key: requestKey, data: previous.data, error: PREVIEW_ERROR }))
      })

    // A close (or a newer request) orphans this one, so a reopen never settles on its stale answer.
    return () => {
      latestRequestRef.current += 1
    }
  }, [enabled, appointmentId, scope, action, requestKey])

  const isSettled = enabled && state.key === requestKey
  let status: ScopePreview['status'] = 'loading'
  if (isSettled && state.error !== null) {
    status = 'error'
  } else if (isSettled && state.data !== null) {
    status = 'ready'
  } else if (enabled && state.data !== null) {
    status = 'refreshing'
  }

  return {
    status,
    data: enabled ? state.data : null,
    error: isSettled ? state.error : null,
    dataKey: enabled ? state.key : null,
    retry: () => setAttempt((count) => count + 1),
  }
}

type ScopePreviewSlotProps = {
  preview: ScopePreview
  children: (data: ScopePreviewData) => React.ReactNode
}

export function ScopePreviewSlot({ preview, children }: ScopePreviewSlotProps) {
  // Persists across every state, so focus has somewhere to land when Try again unmounts.
  const slotRef = useRef<HTMLDivElement>(null)
  // The first sentence after the skeleton fades in slower than the later scope changes.
  const [firstDataKey, setFirstDataKey] = useState<string | null>(null)
  if (preview.status === 'ready' && firstDataKey === null) {
    setFirstDataKey(preview.dataKey)
  }

  function handleRetry() {
    slotRef.current?.focus()
    preview.retry()
  }

  const isBusy = preview.status === 'loading' || preview.status === 'refreshing'
  const fadeClasses =
    preview.dataKey === firstDataKey ? 'duration-slow' : 'duration-base ease-out-quart'

  let content: React.ReactNode
  if (preview.status === 'error') {
    content = (
      <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
        <AlertCircle aria-hidden="true" />
        <AlertTitle>Couldn&apos;t load the preview</AlertTitle>
        <AlertDescription>
          <span className="block">{preview.error}</span>
          <Button type="button" variant="outline" className="mt-2 text-foreground" onClick={handleRetry}>
            <RotateCcw aria-hidden="true" />
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else if (preview.data === null) {
    content = (
      <div className="min-h-[4.5rem] rounded-lg bg-muted/50 p-3">
        <div className="mt-1 space-y-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    )
  } else {
    content = (
      // Dimming and the fade-in sit on separate elements: both set a duration.
      <div
        className={`min-h-[4.5rem] rounded-lg bg-muted/50 p-3 transition-opacity duration-fast ${preview.status === 'refreshing' ? 'opacity-50' : ''}`}
      >
        <p key={preview.dataKey} className={`animate-in fade-in-0 ${fadeClasses}`}>
          {children(preview.data)}
        </p>
      </div>
    )
  }

  return (
    <div
      ref={slotRef}
      tabIndex={-1}
      role="status"
      aria-live="polite"
      aria-busy={isBusy}
      className="min-h-[4.5rem] text-sm leading-6 text-foreground outline-none"
    >
      {content}
    </div>
  )
}
