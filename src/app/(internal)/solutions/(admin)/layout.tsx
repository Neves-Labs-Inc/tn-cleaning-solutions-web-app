import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

import AdminQueryProvider from '@/components/admin/admin-query-provider'

export default async function AdminLayout({
	children,
}: {
	children: ReactNode
}) {
	const supabase = await createClient()
	const {
		data: { user },
	} = await supabase.auth.getUser()

	const role = user?.app_metadata?.role

	if (!user) {
		redirect('/login')
	}

	if (role !== 'admin') {
		redirect('/solutions/schedule')
	}

	return <AdminQueryProvider>{children}</AdminQueryProvider>
}
