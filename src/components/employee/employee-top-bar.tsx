'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { isActive, navItems } from './employee-nav-items'

const SCHEDULE_HREF = '/solutions/schedule'
const DETAIL_TITLE = 'Appointment'

export default function EmployeeTopBar(): React.ReactNode {
	const pathname = usePathname() ?? ''
	const isDetail = pathname.startsWith(`${SCHEDULE_HREF}/`)
	const title = isDetail
		? DETAIL_TITLE
		: navItems.find((item) => isActive(pathname, item.href))?.label

	return (
		<header className="sticky top-0 z-40 border-b bg-background/90 pt-[var(--safe-top)] backdrop-blur">
			<div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
				{isDetail ? (
					<Link
						href={SCHEDULE_HREF}
						className={cn(buttonVariants({ variant: 'ghost' }), '-ml-2 h-11 gap-1 px-2')}
					>
						<ArrowLeft className="size-5" aria-hidden="true" />
						Schedule
					</Link>
				) : (
					<div
						aria-hidden="true"
						className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
					>
						TN
					</div>
				)}

				{title ? (
					<span className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight text-foreground">
						{title}
					</span>
				) : (
					<span className="flex-1" />
				)}

				<nav aria-label="Employee" className="hidden shrink-0 items-center gap-1 md:flex">
					{navItems.map((item) => {
						const Icon = item.icon
						const isCurrent = isActive(pathname, item.href)

						return (
							<Link
								key={item.href}
								href={item.href}
								aria-current={isCurrent ? 'page' : undefined}
								className={cn(
									'inline-flex h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors duration-[120ms] outline-none',
									'hover:bg-muted active:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
									isCurrent ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
								)}
							>
								<Icon
									className="size-4"
									strokeWidth={isCurrent ? 2.5 : 2}
									aria-hidden="true"
								/>
								{item.label}
							</Link>
						)
					})}
				</nav>
			</div>
		</header>
	)
}
