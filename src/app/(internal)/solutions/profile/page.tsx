import { LogOut } from 'lucide-react'
import { redirect } from 'next/navigation'

import { PasswordForm } from '@/components/profile/password-form'
import { ProfileForm } from '@/components/profile/profile-form'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import PageHeader from '@/components/ui/page-header'
import SubmitButton from '@/components/ui/submit-button'
import { createClient } from '@/lib/supabase/server'

import signOutAction from '../signOutAction'

function formatRole(role: string): string {
    return role.charAt(0).toUpperCase() + role.slice(1)
}

export default async function ProfilePage() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: employee } = await supabase
        .from('employees')
        .select('full_name, phone')
        .eq('user_id', user.id)
        .maybeSingle()

    const role = (user.app_metadata?.role as string | undefined) ?? 'employee'
    const accountCreatedAt = new Intl.DateTimeFormat('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(user.created_at))

    return (
        <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in-0 duration-slow">
            <PageHeader title="Profile" />

            <Card className="sm:py-5">
                <CardHeader className="sm:px-5">
                    <CardTitle className="text-lg font-semibold tracking-tight">Account</CardTitle>
                </CardHeader>
                <CardContent className="sm:px-5">
                    <dl className="sm:items-baseline space-y-4 sm:grid sm:grid-cols-[auto_1fr] sm:gap-x-6 sm:gap-y-3 sm:space-y-0">
                        <dt className="text-xs font-medium text-muted-foreground">Email</dt>
                        <dd
                            className={
                                user.email
                                    ? 'break-all text-sm text-foreground'
                                    : 'text-sm text-muted-foreground'
                            }
                        >
                            {user.email ?? 'Not available'}
                        </dd>
                        <dt className="text-xs font-medium text-muted-foreground">Role</dt>
                        <dd>
                            <Badge
                                variant={role === 'admin' ? 'default' : 'secondary'}
                                className="h-6 text-xs"
                            >
                                {formatRole(role)}
                            </Badge>
                        </dd>
                        <dt className="text-xs font-medium text-muted-foreground">Account created</dt>
                        <dd className="text-sm text-foreground">{accountCreatedAt}</dd>
                    </dl>
                </CardContent>
            </Card>

            <ProfileForm
                fullName={employee?.full_name ?? ''}
                phone={employee?.phone ?? ''}
            />

            <PasswordForm />

            <form action={signOutAction}>
                <SubmitButton
                    label="Sign out"
                    pendingLabel="Signing out…"
                    variant="outline"
                    size="lg"
                    className="w-full"
                    icon={<LogOut aria-hidden="true" />}
                />
            </form>
        </div>
    )
}
