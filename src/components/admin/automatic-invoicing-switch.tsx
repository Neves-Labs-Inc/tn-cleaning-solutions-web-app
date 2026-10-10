'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { setClientAutomaticInvoicing } from '@/lib/actions/invoices'

const FALLBACK_ERROR = 'Try again.'

type AutomaticInvoicingSwitchProps = {
  clientId: string
  clientName: string
  isOn: boolean
}

export default function AutomaticInvoicingSwitch({ clientId, clientName, isOn }: AutomaticInvoicingSwitchProps) {
  const [isSaving, startSaving] = useTransition()
  const [optimisticIsOn, setOptimisticIsOn] = useOptimistic(isOn)
  const [error, setError] = useState<string | null>(null)

  function handleCheckedChange(next: boolean) {
    setError(null)
    startSaving(async () => {
      setOptimisticIsOn(next)

      const formData = new FormData()
      formData.set('client_id', clientId)
      formData.set('automatic_invoicing', String(next))

      try {
        const result = await setClientAutomaticInvoicing(null, formData)

        // The optimistic value falls back to the server's when the transition ends, so a failure reverts itself.
        if (result.success) {
          toast.success(`Automatic invoicing ${next ? 'on' : 'off'} for ${clientName}`)
          return
        }
        setError(result.error || FALLBACK_ERROR)
      } catch (thrown) {
        // A network or server failure: show it inline like a refusal; the switch reverts.
        console.error('setClientAutomaticInvoicing failed', thrown)
        setError(FALLBACK_ERROR)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 rounded-lg bg-card p-4 shadow-sm ring-1 ring-foreground/10">
        <Label
          aria-busy={isSaving}
          className="min-h-11 cursor-pointer justify-between gap-3 py-2 text-sm font-semibold -mx-2 rounded-md px-2 md:hover:bg-muted/50"
        >
          <span className="flex items-center">
            Automatic invoicing
            <span className="ml-2 size-4">{isSaving ? <Spinner /> : null}</span>
          </span>
          <Switch checked={optimisticIsOn} disabled={isSaving} onCheckedChange={handleCheckedChange} />
        </Label>
        <p className="text-sm text-muted-foreground">
          Completed visits join an Automatic draft. Turning this off keeps the open draft; new completions won&apos;t
          join it.
        </p>
      </div>

      {error === null ? null : (
        <Alert variant="destructive" className="animate-in fade-in-0 slide-in-from-top-1 duration-base ease-out-quart">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>Couldn&apos;t change Automatic invoicing</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
