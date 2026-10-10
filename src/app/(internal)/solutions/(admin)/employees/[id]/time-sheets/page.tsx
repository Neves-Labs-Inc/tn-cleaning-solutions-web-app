import { redirect } from 'next/navigation'

import { buildTimeSheetsHref } from '@/components/admin/time-sheets/time-sheets-href'

type AdminEmployeeTimeSheetsPageProps = {
	params: Promise<{ id: string }>
}

// The admin timesheet is one screen now; any legacy ?month= is dropped on purpose.
export default async function AdminEmployeeTimeSheetsPage({ params }: AdminEmployeeTimeSheetsPageProps) {
	const { id } = await params
	redirect(buildTimeSheetsHref({ cleaner: id }))
}
