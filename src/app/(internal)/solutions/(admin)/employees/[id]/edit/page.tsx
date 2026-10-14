import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { EmployeeEditForm } from '@/components/admin/employee-edit-form'
import { createClient } from '@/lib/supabase/server'

type EditEmployeePageProps = {
  params: Promise<{ id: string }>
}

export default async function EditEmployeePage({ params }: EditEmployeePageProps) {
  const { id } = await params
  const supabase = await createClient()

  const { data: employee, error } = await supabase
    .from('employees')
    .select('id, full_name, phone, started_at, address, default_payout_method, e_transfer_contact, is_active, is_archived')
    .eq('id', id)
    .maybeSingle()

  if (error || !employee || employee.is_archived) {
    notFound()
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="rounded-2xl border border-emerald-100 bg-white p-6 shadow-sm shadow-emerald-950/5">
        <div className="space-y-3">
          <Link
            href={`/solutions/employees/${id}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to Employee
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-neutral-950">Edit Employee</h1>
            <p className="mt-2 text-sm text-neutral-600">Update employee profile and status.</p>
          </div>
        </div>
      </section>

      <EmployeeEditForm
        employee={{
          id: employee.id,
          full_name: employee.full_name,
          phone: employee.phone,
          started_at: employee.started_at,
          address: employee.address,
          default_payout_method: employee.default_payout_method,
          e_transfer_contact: employee.e_transfer_contact,
          is_active: employee.is_active,
        }}
      />
    </div>
  )
}