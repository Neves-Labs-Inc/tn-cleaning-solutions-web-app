'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from '@/lib/supabase/server'

export type ClockActionState = {
	success?: boolean
	error?: string
}

type ClockAction = 'in' | 'out'

const clockOutcomeErrors: Record<string, string> = {
	not_assigned: 'Assignment not found',
	clock_in_after_clock_out: 'Already clocked out - cannot clock in again',
	already_clocked_in: 'Already clocked in',
	already_clocked_out: 'Already clocked out',
	clock_out_before_clock_in: 'Must clock in before clocking out',
	appointment_completed: 'This appointment is completed. Clock actions are disabled.',
	appointment_cancelled: 'This appointment is cancelled. Clock actions are disabled.',
}

export async function clockIn(appointmentEmployeeId: string): Promise<ClockActionState> {
	return recordClock(appointmentEmployeeId, 'in')
}

export async function clockOut(appointmentEmployeeId: string): Promise<ClockActionState> {
	return recordClock(appointmentEmployeeId, 'out')
}

async function recordClock(appointmentEmployeeId: string, clockAction: ClockAction): Promise<ClockActionState> {
	const supabase = await createClient()
	const { data: outcome, error } = await supabase.rpc('employee_clock', {
		assignment_id: appointmentEmployeeId,
		clock_action: clockAction,
	})

	let result: ClockActionState

	if (error) {
		result = { error: error.message }
	} else if (outcome !== 'clocked') {
		result = { error: clockOutcomeErrors[outcome] ?? 'Could not record your clock time' }
	} else {
		revalidatePath('/solutions/schedule')
		revalidatePath('/solutions/schedule/[id]', 'page')

		result = { success: true }
	}

	return result
}
