import { CalendarDays, Clock3, UserRound, Wallet } from 'lucide-react'

export const navItems = [
	{ label: 'Schedule', href: '/solutions/schedule', icon: CalendarDays },
	{ label: 'Time Sheets', href: '/solutions/time-sheets', icon: Clock3 },
	{ label: 'My pay', href: '/solutions/my-pay', icon: Wallet },
	{ label: 'Profile', href: '/solutions/profile', icon: UserRound },
] as const

export function isActive(pathname: string, href: string): boolean {
	return pathname === href || pathname.startsWith(`${href}/`)
}
