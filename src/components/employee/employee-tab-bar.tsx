'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

import { isActive, navItems } from './employee-nav-items'

export default function EmployeeTabBar(): React.ReactNode {
	const pathname = usePathname() ?? ''
	const activeIndex = navItems.findIndex((item) => isActive(pathname, item.href))

	return (
		<nav
			aria-label="Employee"
			className="fixed inset-x-0 bottom-0 z-40 h-[calc(3.5rem+var(--safe-bottom))] border-t bg-background/95 pb-[var(--safe-bottom)] backdrop-blur md:hidden"
		>
			<span
				aria-hidden="true"
				style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
				className={cn(
					'pointer-events-none absolute top-0 left-0 h-0.5 w-1/3 rounded-full bg-primary transition-[transform,opacity] duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]',
					activeIndex < 0 && 'opacity-0'
				)}
			/>
			<div className="flex h-14">
				{navItems.map((item, index) => {
					const Icon = item.icon
					const isCurrent = index === activeIndex

					return (
						<Link
							key={item.href}
							href={item.href}
							aria-current={isCurrent ? 'page' : undefined}
							className={cn(
								'flex min-h-11 min-w-16 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors duration-[120ms] outline-none',
								'active:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50',
								isCurrent ? 'text-primary' : 'text-muted-foreground'
							)}
						>
							<Icon
								className="size-6 transition-colors duration-[120ms]"
								strokeWidth={isCurrent ? 2.5 : 2}
								aria-hidden="true"
							/>
							{item.label}
						</Link>
					)
				})}
			</div>
		</nav>
	)
}
