import NextTopLoader from 'nextjs-toploader'

import { AdminSidebar } from '@/components/admin/sidebar-nav'
import EmployeeTabBar from '@/components/employee/employee-tab-bar'
import EmployeeTopBar from '@/components/employee/employee-top-bar'
import { Toaster } from '@/components/ui/sonner'
import { createClient } from '@/lib/supabase/server'

import signOutAction from './signOutAction'

// 56px top bar + 8px gap, below the notch, at every width
const TOAST_TOP_OFFSET = 'calc(var(--safe-top) + 64px)'

export default async function SolutionsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const role = user?.app_metadata?.role

    if (role === 'admin') {
        return (
            <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-950 lg:flex-row">
                <NextTopLoader color="#10b981" showSpinner={false} />
                <Toaster position="top-center" offset={{ top: TOAST_TOP_OFFSET }} mobileOffset={{ top: TOAST_TOP_OFFSET }} />
                <AdminSidebar onLogout={signOutAction} />
                <main className="min-w-0 flex-1 overflow-x-clip">
                    <div className="mx-auto w-full max-w-7xl p-6 md:p-8">
                        {children}
                    </div>
                </main>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <NextTopLoader color="#008235" showSpinner={false} />
            <Toaster position="top-center" offset={{ top: TOAST_TOP_OFFSET }} mobileOffset={{ top: TOAST_TOP_OFFSET }} />
            <EmployeeTopBar />
            <main className="mx-auto w-full max-w-6xl px-4 py-4 pb-[calc(3.5rem+var(--safe-bottom))] sm:px-6 md:pb-8 lg:px-8 lg:py-8">
                {children}
            </main>
            <EmployeeTabBar />
        </div>
    )
}