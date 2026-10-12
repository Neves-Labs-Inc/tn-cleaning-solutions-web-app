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
  searchParams: Promise<{ token_hash?: string | string[] }>
}

export default async function UpdatePasswordPage({
  searchParams,
}: UpdatePasswordPageProps) {
  const rawTokenHash = (await searchParams).token_hash
  const tokenHash =
    (Array.isArray(rawTokenHash) ? rawTokenHash[0] : rawTokenHash) ?? null

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
        <UpdatePasswordForm tokenHash={tokenHash} action={updatePasswordAction} />
      </CardContent>
    </Card>
  )
}

async function updatePasswordAction(
  previousState: UpdatePasswordActionState,
  formData: FormData
): Promise<UpdatePasswordActionState> {
  'use server'

  const tokenHash = String(formData.get('token_hash') ?? '')
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
    // Verify only on submit: scanners and prefetches would burn the
    // single-use token if it ran on page load.
    const verifyError = previousState.sessionEstablished
      ? null
      : (
          await client.auth.verifyOtp({
            token_hash: tokenHash,
            type: 'recovery',
          })
        ).error

    if (verifyError) {
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
