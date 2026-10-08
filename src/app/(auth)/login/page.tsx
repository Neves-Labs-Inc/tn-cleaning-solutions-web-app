import { redirect } from 'next/navigation'

import { LoginForm, type LoginActionState } from '@/components/auth/login-form'
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { createClient } from '@/lib/supabase/server'

const initialState: LoginActionState = {
    error: null,
    fieldErrors: {},
}

async function loginAction(
    _previousState: LoginActionState,
    formData: FormData
): Promise<LoginActionState> {
    'use server'

    const email = String(formData.get('email') ?? '').trim()
    const password = String(formData.get('password') ?? '')

    const fieldErrors: LoginActionState['fieldErrors'] = {}

    if (!email) {
        fieldErrors.email = 'Email is required.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fieldErrors.email = 'Enter a valid email address.'
    }

    if (!password) {
        fieldErrors.password = 'Password is required.'
    }

    if (Object.keys(fieldErrors).length > 0) {
        return {
            ...initialState,
            fieldErrors,
        }
    }

    const client = await createClient()
    const { error } = await client.auth.signInWithPassword({
        email,
        password,
    })

    if (error) {
        return {
            error: 'Invalid email or password.',
            fieldErrors: {},
        }
    }

    redirect('/solutions')
}

export default function LoginPage() {
    return (
        <Card className="sm:py-5">
            <CardHeader className="sm:px-5">
                <CardTitle className="text-xl font-semibold tracking-tight">
                    Welcome back
                </CardTitle>
                <CardDescription className="text-sm text-muted-foreground">
                    Sign in with your TN Cleaning Solutions credentials to continue.
                </CardDescription>
            </CardHeader>
            <CardContent className="sm:px-5">
                <LoginForm action={loginAction} />
            </CardContent>
        </Card>
    )
}
