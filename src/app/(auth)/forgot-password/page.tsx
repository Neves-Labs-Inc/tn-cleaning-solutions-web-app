import {
  ForgotPasswordForm,
  type ForgotPasswordActionState,
} from '@/components/auth/forgot-password-form'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

async function forgotPasswordAction(
  _previousState: ForgotPasswordActionState,
  formData: FormData
): Promise<ForgotPasswordActionState> {
  'use server'

  const email = String(formData.get('email') ?? '').trim()

  if (!email) {
    return { success: false, fieldErrors: { email: 'Email is required.' } }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      success: false,
      fieldErrors: { email: 'Enter a valid email address.' },
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const client = await createClient()
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/update-password`,
  })

  if (error) {
    console.error('resetPasswordForEmail failed:', error.status, error.code)
  }

  return { success: true, fieldErrors: {} }
}

export default function ForgotPasswordRequestPage() {
  return (
    <Card className="sm:py-5">
      <CardHeader className="sm:px-5">
        <CardTitle className="text-xl font-semibold tracking-tight">
          Reset your password
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Enter your email and we&apos;ll send you a link to reset your
          password.
        </CardDescription>
      </CardHeader>
      <CardContent className="sm:px-5">
        <ForgotPasswordForm action={forgotPasswordAction} />
      </CardContent>
    </Card>
  )
}
