'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { ClientLocations, type LocationRef, type Result } from '@/lib/clients/client-locations'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@/lib/supabase/server'

type ClientFieldErrors = {
  name?: string
  email?: string
}

type LocationFieldErrors = {
  label?: string
  address?: string
}

export type ClientActionResult =
  | { success: true; data?: { id: string } }
  | { success: false; error: string; fieldErrors?: ClientFieldErrors }

export type LocationActionResult =
  | { success: true; data?: { id: string; clientId: string } }
  | { success: false; error: string; fieldErrors?: LocationFieldErrors }

type ParsedClientInput = {
  name: string
  email: string | null
  phone: string | null
  notes: string | null
  is_active: boolean
  address: string
}

type ParsedLocationInput = {
  label: string
  address: string
  notes: string | null
}

const CREATE_CLIENT_ERROR = "Couldn't create the client. Try again."
const ADD_LOCATION_ERROR = "Couldn't add the location. Try again."

async function requireAdminRole(): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = await createSupabaseClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error) {
    console.error('Admin check failed', error)
    return { success: false, error: 'Not authenticated' }
  }

  if (!user) {
    return { success: false, error: 'Not authenticated' }
  }

  if (user.app_metadata?.role !== 'admin') {
    return { success: false, error: 'Unauthorized' }
  }

  return { success: true }
}

function parseClientFormData(formData: FormData):
  | { success: true; data: ParsedClientInput }
  | { success: false; error: string; fieldErrors: ClientFieldErrors } {
  const name = String(formData.get('name') ?? '').trim()
  const emailRaw = String(formData.get('email') ?? '').trim()
  const phoneRaw = String(formData.get('phone') ?? '').trim()
  const notesRaw = String(formData.get('notes') ?? '').trim()
  const isActive = formData.get('is_active') === 'on'

  const fieldErrors: ClientFieldErrors = {}

  if (!name) {
    fieldErrors.name = 'Name is required.'
  }

  if (emailRaw) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(emailRaw)) {
      fieldErrors.email = 'Enter a valid email address.'
    }
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
      name,
      email: emailRaw || null,
      phone: phoneRaw || null,
      notes: notesRaw || null,
      is_active: isActive,
      address: '',
    },
  }
}

function parseLocationFormData(formData: FormData):
  | { success: true; data: ParsedLocationInput }
  | { success: false; error: string; fieldErrors: LocationFieldErrors } {
  const labelRaw = String(formData.get('label') ?? '').trim()
  const address = String(formData.get('address') ?? '').trim()
  const notesRaw = String(formData.get('notes') ?? '').trim()

  const fieldErrors: LocationFieldErrors = {}

  if (!address) {
    fieldErrors.address = 'Address is required.'
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
      label: labelRaw || 'Location',
      address,
      notes: notesRaw || null,
    },
  }
}

export async function createClient(formData: FormData): Promise<ClientActionResult>
export async function createClient(
  _prevState: ClientActionResult,
  formData: FormData
): Promise<ClientActionResult>
export async function createClient(
  firstArg: FormData | ClientActionResult,
  secondArg?: FormData
): Promise<ClientActionResult> {
  const formData = firstArg instanceof FormData ? firstArg : secondArg

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseClientFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  let createdId = ''

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('clients')
      .insert(parsed.data)
      .select('id')
      .single()

    if (error) {
      console.error('Client create failed', error)
      return { success: false, error: CREATE_CLIENT_ERROR }
    }

    createdId = data.id
  } catch (error) {
    console.error('Client create failed', error)
    return { success: false, error: CREATE_CLIENT_ERROR }
  }

  revalidatePath('/solutions/clients')
  revalidatePath(`/solutions/clients/${createdId}`)
  redirect(`/solutions/clients/${createdId}`)

  return { success: true, data: createdId ? { id: createdId } : undefined }
}

export async function updateClient(id: string, formData: FormData): Promise<ClientActionResult>
export async function updateClient(
  id: string,
  _prevState: ClientActionResult,
  formData: FormData
): Promise<ClientActionResult>
export async function updateClient(
  id: string,
  secondArg: FormData | ClientActionResult,
  thirdArg?: FormData
): Promise<ClientActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!id) {
    return { success: false, error: 'Client id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseClientFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('clients')
      .update(parsed.data)
      .eq('id', id)
      .eq('is_archived', false)
      .select('id')
      .maybeSingle()

    if (error) {
      console.error('Client update failed', id, error)
      return { success: false, error: "Couldn't save the client. Try again." }
    }

    if (!data) {
      return { success: false, error: 'Client not found.' }
    }
  } catch (error) {
    console.error('Client update failed', id, error)
    return { success: false, error: "Couldn't save the client. Try again." }
  }

  // The edit dialog stays on the client page, so it gets a result back instead of a redirect.
  revalidatePath('/solutions/clients')
  revalidatePath(`/solutions/clients/${id}`)
  return { success: true, data: { id } }
}

export async function archiveClient(id: string): Promise<ClientActionResult> {
  if (!id) {
    return { success: false, error: 'Client id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('clients')
    .update({ is_archived: true })
    .eq('id', id)

  if (error) {
    console.error('Client archive failed', id, error)
    return { success: false, error: "Couldn't archive the client. Try again." }
  }

  revalidatePath('/solutions/clients')
  revalidatePath(`/solutions/clients/${id}`)
  return { success: true }
}

export async function restoreClient(id: string): Promise<ClientActionResult> {
  if (!id) {
    return { success: false, error: 'Client id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const adminClient = createAdminClient()
  const { error } = await adminClient
    .from('clients')
    .update({ is_archived: false })
    .eq('id', id)

  if (error) {
    console.error('Client restore failed', id, error)
    return { success: false, error: "Couldn't restore the client. Try again." }
  }

  revalidatePath('/solutions/clients')
  revalidatePath(`/solutions/clients/${id}`)
  return { success: true }
}

export async function addLocation(clientId: string, formData: FormData): Promise<LocationActionResult>
export async function addLocation(
  clientId: string,
  _prevState: LocationActionResult,
  formData: FormData
): Promise<LocationActionResult>
export async function addLocation(
  clientId: string,
  secondArg: FormData | LocationActionResult,
  thirdArg?: FormData
): Promise<LocationActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!clientId) {
    return { success: false, error: 'Client id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseLocationFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  const supabase = await createSupabaseClient()
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .eq('is_archived', false)
    .maybeSingle()

  if (clientError) {
    console.error('Location add failed to look up client', clientId, clientError)
    return { success: false, error: ADD_LOCATION_ERROR }
  }

  if (!client) {
    return { success: false, error: 'Client not found.' }
  }

  let locationId = ''

  try {
    const adminClient = createAdminClient()
    const { data, error } = await adminClient
      .from('client_locations')
      .insert({
        client_id: clientId,
        label: parsed.data.label,
        address: parsed.data.address,
        notes: parsed.data.notes,
      })
      .select('id')
      .single()

    if (error) {
      console.error('Location add failed', clientId, error)
      return { success: false, error: ADD_LOCATION_ERROR }
    }

    locationId = data.id
  } catch (error) {
    console.error('Location add failed', clientId, error)
    return { success: false, error: ADD_LOCATION_ERROR }
  }

  revalidatePath('/solutions/clients')
  return {
    success: true,
    data: locationId ? { id: locationId, clientId } : undefined,
  }
}

export async function updateLocation(
  locationId: string,
  formData: FormData
): Promise<LocationActionResult>
export async function updateLocation(
  locationId: string,
  _prevState: LocationActionResult,
  formData: FormData
): Promise<LocationActionResult>
export async function updateLocation(
  locationId: string,
  secondArg: FormData | LocationActionResult,
  thirdArg?: FormData
): Promise<LocationActionResult> {
  const formData = secondArg instanceof FormData ? secondArg : thirdArg

  if (!locationId) {
    return { success: false, error: 'Location id is required.' }
  }

  if (!formData) {
    return { success: false, error: 'Invalid form submission.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const parsed = parseLocationFormData(formData)
  if (!parsed.success) {
    return parsed
  }

  const locations = await createClientLocations()
  return settleLocationChange(await locations.update(locationId, parsed.data))
}

export async function archiveLocation(locationId: string): Promise<LocationActionResult> {
  return setLocationArchived(locationId, true)
}

export async function restoreLocation(locationId: string): Promise<LocationActionResult> {
  return setLocationArchived(locationId, false)
}

async function setLocationArchived(locationId: string, isArchived: boolean): Promise<LocationActionResult> {
  if (!locationId) {
    return { success: false, error: 'Location id is required.' }
  }

  const authResult = await requireAdminRole()
  if (!authResult.success) {
    return { success: false, error: authResult.error }
  }

  const locations = await createClientLocations()
  return settleLocationChange(await locations.setArchived(locationId, isArchived))
}

async function createClientLocations(): Promise<ClientLocations> {
  return new ClientLocations(await createSupabaseClient(), createAdminClient())
}

function settleLocationChange(result: Result<LocationRef>): LocationActionResult {
  if (!result.value) {
    return { success: false, error: result.error ?? 'Failed to change location.' }
  }

  revalidatePath('/solutions/clients')
  return { success: true, data: result.value }
}
