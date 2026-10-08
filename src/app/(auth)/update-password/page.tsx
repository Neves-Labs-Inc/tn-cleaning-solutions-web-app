import {
  UpdatePasswordForm,
  type UpdatePasswordActionState,
} from '@/components/auth/update-password-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

type UpdatePasswordPageProps = {
  searchParams: Promise<{ code?: string | string[] }>
}

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
  const rawCode = (await searchParams).code
  const code = (Array.isArray(rawCode) ? rawCode[0] : rawCode) ?? null

  return (
    <Card className="sm:py-5">
      <CardHeader className="sm:px-5">
        <CardTitle className="text-xl font-semibold tracking-tight">
          Set a new password
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Choose a new password for your TN Cleaning Solutions account.
        </CardDescription>
      </CardHeader>
      <CardContent className="sm:px-5">
        <UpdatePasswordForm code={code} action={updatePasswordAction} />
      </CardContent>
    </Card>
  )
}

async function updatePasswordAction(
  previousState: UpdatePasswordActionState,
  formData: FormData
): Promise<UpdatePasswordActionState> {
  'use server'

  const code = String(formData.get('code') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirmPassword = String(formData.get('confirmPassword') ?? '')

  const fieldErrors: UpdatePasswordActionState['fieldErrors'] = {}

  if (password.length < 8) {
    fieldErrors.password = 'Password must be at least 8 characters.'
  }

  if (password !== confirmPassword) {
    fieldErrors.confirmPassword = 'Passwords do not match.'
  }

  let state: UpdatePasswordActionState

  if (Object.keys(fieldErrors).length > 0) {
    state = {
      status: 'editing',
      sessionEstablished: previousState.sessionEstablished,
      error: null,
      fieldErrors,
    }
  } else {
    const client = await createClient()
    const exchangeError = previousState.sessionEstablished
      ? null
      : (await client.auth.exchangeCodeForSession(code)).error

    if (exchangeError) {
      state = {
        status: 'invalid-link',
        sessionEstablished: false,
        error: null,
        fieldErrors: {},
      }
    } else {
      const { error: updateError } = await client.auth.updateUser({ password })

      if (updateError) {
        state = {
          status: 'editing',
          sessionEstablished: true,
          error: updateError.message,
          fieldErrors: {},
        }
      } else {
        state = {
          status: 'updated',
          sessionEstablished: true,
          error: null,
          fieldErrors: {},
        }
      }
    }
  }

  return state
}
