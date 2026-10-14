'use server'

import { revalidatePath } from 'next/cache'

import {
  parseEmployeeUpdateFormData,
  type EmployeeFieldErrors,
} from '@/lib/employees/employee-form'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type EmployeeActionResult =
  | { success: true; data?: { id?: string; email?: string } }
  | { success: false; error: string; fieldErrors?: EmployeeFieldErrors }

type ParsedInviteInput = {
  email: string
  full_name: string
}

async function requireAdminRole(): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  if (user.app_metadata?.role !== 'admin') {
    return { success: false, error: 'Unauthorized' }
  }

  return { success: true }
}

function parseInviteFormData(formData: FormData):
  | { success: true; data: ParsedInviteInput }
  | { success: false; error: string; fieldErrors: EmployeeFieldErrors } {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const fullName = String(formData.get('full_name') ?? '').trim()

  const fieldErrors: EmployeeFieldErrors = {}

  if (!email) {
    fieldErrors.email = 'Email is required.'
  } else if (!EMAIL_PATTERN.test(email)) {
    fieldErrors.email = 'Enter a valid email address.'
  }

  if (!fullName) {
    fieldErrors.full_name = 'Full name is required.'
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      success: false,
      error: 'Please correct the highlighted fields.',
      fieldErrors,
    }
  }

  return {
    success: true,
    data: {
      email,
      full_name: fullName,
    },
  }
}

export async function inviteEmployee(formData: FormData): Promise<EmployeeActionResult>
export async function inviteEmployee(
  _prevState: EmployeeActionResult,
  formData: FormData
): Promise<EmployeeActionResult>
export async function inviteEmployee(
  firstArg: FormData | EmployeeActionResult,
  secondArg?: FormData
): Promise<EmployeeActionResult> {
  const formData = firstArg instanceof FormData ? firstArg : secondArg

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseInviteFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  try {
    const adminClient = createAdminClient()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      parsed.data.email,
      {
        redirectTo: `${appUrl}/accept-invite`,
        data: {},
      }
    )

    if (inviteError) {
      return { success: false, error: inviteError.message }
    }

    const userId = inviteData.user?.id
    if (!userId) {
      return { success: false, error: 'Invite sent, but user id was not returned by Supabase.' }
    }

    const { error: roleError } = await adminClient.auth.admin.updateUserById(userId, {
      app_metadata: {
        role: 'employee',
      },
    })

    if (roleError) {
      return { success: false, error: roleError.message }
    }

    const { error: upsertError } = await adminClient.from('employees').upsert(
      {
        user_id: userId,
        full_name: parsed.data.full_name,
        is_active: true,
        is_archived: false,
      },
      {
        onConflict: 'user_id',
      }
    )

    if (upsertError) {
      return { success: false, error: upsertError.message }
    }
  } catch {
    return { success: false, error: 'Failed to send invite.' }
  }

  revalidatePath('/solutions/employees')
  return { success: true, data: { email: parsed.data.email } }
}

export async function updateEmployee(id: string, formData: FormData): Promise<EmployeeActionResult>
export async function updateEmployee(
  id: string,
  _prevState: EmployeeActionResult,
  formData: FormData
): Promise<EmployeeActionResult>
export async function updateEmployee(
  id: string,
  secondArg: FormData | EmployeeActionResult,
  thirdArg?: FormData
): Promise<EmployeeActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!id) {
    return { success: false, error: 'Employee id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseEmployeeUpdateFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('employees')
      .update(parsed.data)
      .eq('id', id)
      .eq('is_archived', false)
      .select('id')
      .maybeSingle()

    if (error) {
      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: false, error: 'Employee not found.' }
    }
  } catch {
    return { success: false, error: 'Failed to update employee.' }
  }

  revalidatePath('/solutions/employees')
  revalidatePath(`/solutions/employees/${id}`)
  // The form navigates back to the employee page itself, so it can toast on the way.
  return { success: true, data: { id } }
}

export async function deactivateEmployee(id: string): Promise<EmployeeActionResult> {
  if (!id) {
    return { success: false, error: 'Employee id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('employees')
    .update({ is_active: false })
    .eq('id', id)
    .eq('is_archived', false)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/solutions/employees')
  revalidatePath(`/solutions/employees/${id}`)
  return { success: true }
}

export async function activateEmployee(id: string): Promise<EmployeeActionResult> {
  if (!id) {
    return { success: false, error: 'Employee id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('employees')
    .update({ is_active: true })
    .eq('id', id)
    .eq('is_archived', false)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/solutions/employees')
  revalidatePath(`/solutions/employees/${id}`)
  return { success: true }
}