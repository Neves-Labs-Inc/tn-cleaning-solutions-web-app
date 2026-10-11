export type TimeSheetRecord = {
	id: string
	clocked_in_at: string | null
	clocked_out_at: string | null
	// A Removed session: shown struck through, never counted.
	is_removed: boolean
	appointments: {
		scheduled_date: string
		clients: {
			name: string
		}
		jobs: {
			name: string
		}
	}
}