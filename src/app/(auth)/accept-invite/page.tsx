'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useActionState, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, Check, KeyRound, UserRound } from 'lucide-react'

import { Alert, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Spinner } from '@/components/ui/spinner'
import SubmitButton from '@/components/ui/submit-button'
import { createClient } from '@/lib/supabase/browser'

import { completeProfile, type CompleteProfileState } from './actions'

type Step = 'verifying' | 'set-password' | 'complete-profile' | 'error'

const profileInitialState: CompleteProfileState = {
	error: null,
}

const MIN_PASSWORD_LENGTH = 8

const ENTER_CLASSES =
	'animate-in fade-in-0 slide-in-from-bottom-1 duration-base ease-out-quart'

const STEP_LABELS = ['Invite', 'Password', 'Profile']

function StepRow({ activeIndex }: { activeIndex: number }) {
	return (
		<ol aria-label="Setup progress" className="flex items-center gap-3 text-sm">
			{STEP_LABELS.map((label, index) => {
				const isDone = index < activeIndex
				const isActive = index === activeIndex
				const stateSuffix = isDone ? ', completed' : isActive ? ', current step' : ''

				return (
					<li
						key={label}
						aria-current={isActive ? 'step' : undefined}
						className="flex min-w-0 items-center gap-2"
					>
						<span
							className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-base ${
								isDone
									? 'border border-status-success-border bg-status-success text-status-success-foreground'
									: isActive
										? 'bg-foreground text-background'
										: 'bg-muted text-muted-foreground'
							}`}
							aria-hidden="true"
						>
							{isDone ? (
								<Check className="size-3.5 animate-in zoom-in-50 duration-base ease-out-quart" />
							) : (
								index + 1
							)}
						</span>
						<span
							className={`truncate transition-colors duration-base ${
								isDone || isActive ? 'text-foreground' : 'text-muted-foreground'
							}`}
						>
							{label}
							<span className="sr-only">{stateSuffix}</span>
						</span>
					</li>
				)
			})}
		</ol>
	)
}

function SetPasswordForm({
	onSuccess,
}: {
	onSuccess: () => void
}) {
	const supabase = useMemo(() => createClient(), [])
	const [password, setPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		setError(null)

		if (password.length < MIN_PASSWORD_LENGTH) {
			setError('Password must be at least 8 characters long.')
			document.getElementById('password')?.focus()
			return
		}

		if (password !== confirmPassword) {
			setError('Passwords do not match.')
			document.getElementById('confirmPassword')?.focus()
			return
		}

		setPending(true)

		const { error: updateError } = await supabase.auth.updateUser({
			password,
		})

		setPending(false)

		if (updateError) {
			setError(updateError.message || 'Unable to update your password.')
			return
		}

		onSuccess()
	}

	return (
		<form onSubmit={handleSubmit}>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="password" className="text-sm font-medium">
						Create password
					</FieldLabel>
					<PasswordInput
						id="password"
						name="password"
						autoComplete="new-password"
						required
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						placeholder="At least 8 characters"
					/>
				</Field>

				<Field>
					<FieldLabel htmlFor="confirmPassword" className="text-sm font-medium">
						Confirm password
					</FieldLabel>
					<PasswordInput
						id="confirmPassword"
						name="confirmPassword"
						autoComplete="new-password"
						required
						value={confirmPassword}
						onChange={(event) => setConfirmPassword(event.target.value)}
						placeholder="Re-enter your password"
					/>
				</Field>
			</FieldGroup>

			<p className="mt-4 text-sm text-muted-foreground">
				Use a password you do not use anywhere else. This account will unlock the
				employee schedule after your profile is completed.
			</p>

			{error ? (
				<Alert
					variant="destructive"
					role="alert"
					aria-live="polite"
					className={`mt-4 ${ENTER_CLASSES}`}
				>
					<AlertCircle aria-hidden="true" />
					<AlertTitle>{error}</AlertTitle>
				</Alert>
			) : null}

			<Button
				type="submit"
				size="lg"
				disabled={pending}
				aria-busy={pending}
				className="mt-6 w-full"
			>
				{pending ? (
					<span className="inline-flex items-center gap-2">
						<Spinner aria-hidden="true" role="presentation" aria-label={undefined} />
						Saving password...
					</span>
				) : (
					'Continue'
				)}
			</Button>
		</form>
	)
}

function CompleteProfileForm() {
	const [state, formAction] = useActionState(completeProfile, profileInitialState)
	// Controlled so typed values survive React 19's form reset after a failed submit.
	const [fullName, setFullName] = useState('')
	const [phone, setPhone] = useState('')

	return (
		<form action={formAction}>
			<FieldGroup>
				<Field>
					<FieldLabel htmlFor="full_name" className="text-sm font-medium">
						Full name
					</FieldLabel>
					<Input
						id="full_name"
						name="full_name"
						type="text"
						autoComplete="name"
						enterKeyHint="next"
						required
						value={fullName}
						onChange={(event) => setFullName(event.target.value)}
						placeholder="Jordan Rivera"
					/>
				</Field>

				<Field>
					<FieldLabel htmlFor="phone" className="text-sm font-medium">
						Phone number
					</FieldLabel>
					<Input
						id="phone"
						name="phone"
						type="tel"
						inputMode="tel"
						autoComplete="tel"
						enterKeyHint="done"
						required
						value={phone}
						onChange={(event) => setPhone(event.target.value)}
						placeholder="(555) 123-4567"
					/>
				</Field>
			</FieldGroup>

			<p className="mt-4 text-sm text-muted-foreground">
				We use this for operational contact and schedule coordination only.
			</p>

			{state.error ? (
				<Alert
					variant="destructive"
					role="alert"
					aria-live="polite"
					className={`mt-4 ${ENTER_CLASSES}`}
				>
					<AlertCircle aria-hidden="true" />
					<AlertTitle>{state.error}</AlertTitle>
				</Alert>
			) : null}

			<SubmitButton
				label="Finish setup"
				pendingLabel="Saving profile..."
				size="lg"
				className="mt-6 w-full"
			/>
		</form>
	)
}

function AcceptInviteContent() {
	const searchParams = useSearchParams()
	const supabase = useMemo(() => createClient(), [])
	const [step, setStep] = useState<Step>('verifying')
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false

		const verifyInvite = async () => {
			const { data: { user: existingUser } } = await supabase.auth.getUser()
			if (existingUser) {
				if (!cancelled) setStep('set-password')
				return
			}

			// First check URL hash for implicit flow tokens (local Supabase dev)
			const hash = typeof window !== 'undefined' ? window.location.hash.substring(1) : ''
			const hashParams = new URLSearchParams(hash)
			const hashAccessToken = hashParams.get('access_token')
			const hashRefreshToken = hashParams.get('refresh_token')
			const hashType = hashParams.get('type')

			if (hashAccessToken && hashRefreshToken && hashType === 'invite') {
				// Implicit flow: session tokens already in hash — set the session directly
				const { error: sessionError } = await supabase.auth.setSession({
					access_token: hashAccessToken,
					refresh_token: hashRefreshToken,
				})

				if (cancelled) return

				if (sessionError) {
					setError(sessionError.message || 'This invite link is invalid or expired.')
					setStep('error')
					return
				}

				// Clean hash from URL without reloading
				if (typeof window !== 'undefined') {
					window.history.replaceState(null, '', window.location.pathname)
				}

				setStep('set-password')
				return
			}

			// Fallback: PKCE flow — token_hash in query param
			const tokenHash = searchParams.get('token_hash')

			if (!tokenHash) {
				setError('Invalid invite link.')
				setStep('error')
				return
			}

			const { error: verifyError } = await supabase.auth.verifyOtp({
				token_hash: tokenHash,
				type: 'invite',
			})

			if (cancelled) {
				return
			}

			if (verifyError) {
				setError(verifyError.message || 'This invite link is invalid or expired.')
				setStep('error')
				return
			}

			setStep('set-password')
		}

		verifyInvite()

		return () => {
			cancelled = true
		}
	}, [searchParams, supabase])

	const stepIndex =
		step === 'set-password' ? 1 : step === 'complete-profile' ? 2 : 0

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-xl font-semibold tracking-tight">
					{step === 'error'
						? 'We could not verify that invite'
						: step === 'set-password'
							? 'Create your password'
							: step === 'complete-profile'
								? 'Complete your profile'
								: 'Verifying your invite'}
				</CardTitle>
				<StepRow activeIndex={stepIndex} />
			</CardHeader>

			<CardContent>
				<div key={step} className={ENTER_CLASSES}>
					{step === 'verifying' ? (
						<div
							className="flex min-h-48 flex-col items-center justify-center gap-3 text-center"
							aria-busy="true"
						>
							<Spinner className="size-6 text-muted-foreground" />
							<p className="text-base font-semibold">Verifying your invitation</p>
							<p className="text-sm text-muted-foreground">
								We are checking the invite link and preparing your account.
							</p>
						</div>
					) : null}

					{step === 'error' ? (
						<div className="space-y-4">
							<Alert variant="destructive" role="alert" aria-live="polite">
								<AlertCircle aria-hidden="true" />
								<AlertTitle>{error}</AlertTitle>
							</Alert>

							<p className="text-sm text-muted-foreground">
								Ask your administrator to resend the invitation if this link has
								expired or was copied incorrectly.
							</p>

							<Button
								size="lg"
								className="w-full"
								render={<Link href="/login" />}
								nativeButton={false}
							>
								Back to login
								<ArrowRight aria-hidden="true" />
							</Button>
						</div>
					) : null}

					{step === 'set-password' ? (
						<div className="space-y-5">
							<Alert>
								<KeyRound aria-hidden="true" />
								<AlertTitle>
									Your invite was verified. Create the password you will use to
									sign in next time.
								</AlertTitle>
							</Alert>

							<SetPasswordForm onSuccess={() => setStep('complete-profile')} />
						</div>
					) : null}

					{step === 'complete-profile' ? (
						<div className="space-y-5">
							<Alert>
								<UserRound aria-hidden="true" />
								<AlertTitle>
									Your password is set. Finish the profile details below so the
									operations team can keep your account in sync.
								</AlertTitle>
							</Alert>

							<CompleteProfileForm />
						</div>
					) : null}
				</div>
			</CardContent>
		</Card>
	)
}

export default function AcceptInvitePage() {
	return (
		<Suspense>
			<AcceptInviteContent />
		</Suspense>
	)
}
