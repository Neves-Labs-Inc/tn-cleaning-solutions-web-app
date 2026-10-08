'use client'

import { AlertCircle } from 'lucide-react'
import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import SubmitButton from '@/components/ui/submit-button'

import { type ActionState, updateProfile } from '@/lib/actions/profile'

const initialState: ActionState = {}
const NAME_REQUIRED_ERROR = 'Full name is required'

type ProfileFormProps = {
  fullName: string
  phone: string
}

export function ProfileForm({ fullName, phone }: ProfileFormProps) {
  const [state, formAction] = useActionState(updateProfile, initialState)
  const [fullNameValue, setFullNameValue] = useState(fullName)
  const [phoneValue, setPhoneValue] = useState(phone)
  const isNameInvalid = state.error === NAME_REQUIRED_ERROR

  useEffect(() => {
    if (state.success) {
      toast.success('Profile saved')
    }
    if (isNameInvalid) {
      document.getElementById('full_name')?.focus()
    }
  }, [state, isNameInvalid])

  return (
    <Card className="sm:py-5">
      <CardHeader className="sm:px-5">
        <CardTitle className="text-lg font-semibold tracking-tight">Profile information</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Keep this information current so dispatch and management can reach you quickly.
        </CardDescription>
      </CardHeader>
      <CardContent className="sm:px-5">
        <form action={formAction} noValidate>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="full_name" className="text-sm">
                Full name
              </FieldLabel>
              <Input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                value={fullNameValue}
                onChange={(e) => setFullNameValue(e.target.value)}
                aria-invalid={isNameInvalid}
                className="scroll-mb-24"
                placeholder="Jordan Rivera"
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone" className="text-sm">
                Phone
              </FieldLabel>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={phoneValue}
                onChange={(e) => setPhoneValue(e.target.value)}
                className="scroll-mb-24"
                placeholder="(615) 555-0100"
              />
            </Field>
          </FieldGroup>

          {state.error ? (
            <Alert
              variant="destructive"
              className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart"
            >
              <AlertCircle aria-hidden="true" />
              <AlertTitle className="text-sm">{state.error}</AlertTitle>
            </Alert>
          ) : null}

          <SubmitButton label="Save profile" pendingLabel="Saving…" className="mt-6 w-full" />
        </form>
      </CardContent>
    </Card>
  )
}
