'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { clearBrowserQueryCache } from '@/components/admin/admin-query-provider'
import {
  BriefcaseBusiness,
  CalendarDays,
  Clock,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  UserRound,
  Users,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

const navItems = [
  { label: 'Dashboard', href: '/solutions/dashboard', icon: LayoutDashboard },
  { label: 'Appointments', href: '/solutions/appointments', icon: CalendarDays },
  { label: 'Clients', href: '/solutions/clients', icon: Users },
  { label: 'Jobs', href: '/solutions/jobs', icon: BriefcaseBusiness },
  { label: 'Employees', href: '/solutions/employees', icon: UserRound },
  { label: 'Time Sheets', href: '/solutions/time-tracking', icon: Clock },
  { label: 'Invoices', href: '/solutions/invoices', icon: FileText },
  { label: 'Profile', href: '/solutions/profile', icon: UserRound },
] as const

type AdminSidebarProps = {
  onLogout: () => Promise<void>
}

function NavList({
  pathname,
  onNavigate,
}: {
  pathname: string
  onNavigate?: () => void
}) {
  return (
    <ul className="space-y-1">
      {navItems.map((item) => {
        const Icon = item.icon
        const isActive =
          pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              onClick={onNavigate}
              className={cn(
                'group flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-medium text-neutral-600 transition-[color,background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px hover:border-neutral-200 hover:bg-white hover:text-neutral-950',
                isActive &&
                  'border-emerald-600/20 bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
              )}
            >
              <Icon
                className={cn(
                  'size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-neutral-600',
                  isActive && 'text-white'
                )}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function LogoutButton({ onLogout }: { onLogout: () => Promise<void> }) {
  // The server action stays the form action so submit works before hydration;
  // onSubmit only clears the cache and does not preventDefault.
  function handleSubmit() {
    clearBrowserQueryCache()
  }

  return (
    <form action={onLogout} onSubmit={handleSubmit}>
      <button
        type="submit"
        className="cursor-pointer group flex w-full items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-neutral-600 transition-[color,background-color,border-color,transform] duration-200 hover:-translate-y-px hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
      >
        <LogOut
          className="size-4 shrink-0 text-neutral-400 transition-colors group-hover:text-rose-500"
          aria-hidden="true"
        />
        <span>Logout</span>
      </button>
    </form>
  )
}

export function AdminSidebar({ onLogout }: AdminSidebarProps) {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ── Mobile header ── */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-emerald-950/10 bg-white/90 px-4 backdrop-blur-xl lg:hidden">
        <Link href="/solutions/dashboard" className="flex min-w-0 items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20">
            TN
          </div>
          <div className="min-w-0">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">
              TN Cleaning Solutions
            </p>
            <p className="truncate text-sm font-semibold tracking-tight text-neutral-950">
              Admin Portal
            </p>
          </div>
        </Link>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="flex size-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-600 shadow-sm transition-colors hover:bg-neutral-50"
            aria-label="Open navigation"
          >
            <Menu className="size-5" aria-hidden="true" />
          </SheetTrigger>

          <SheetContent side="left" className="w-72 p-0">
            <div className="flex h-full flex-col">
              <div className="border-b border-emerald-950/10 px-6 py-6">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20">
                    TN
                  </div>
                  <div>
                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                      TN Cleaning Solutions
                    </p>
                    <p className="text-base font-semibold tracking-tight text-neutral-950">
                      Admin Portal
                    </p>
                  </div>
                </div>
              </div>

              <nav
                className="flex-1 overflow-y-auto px-4 py-5"
                aria-label="Admin navigation"
              >
                <p className="px-2 pb-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  Navigation
                </p>
                <NavList pathname={pathname} onNavigate={() => setOpen(false)} />
              </nav>

              <div className="border-t border-emerald-950/10 p-4">
                <LogoutButton onLogout={onLogout} />
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      {/* ── Desktop sidebar ── */}
      <aside className="sticky top-0 hidden h-screen w-68 shrink-0 flex-col border-r border-emerald-950/10 bg-white/90 backdrop-blur-xl lg:flex">
        <div className="border-b border-emerald-950/10 px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20">
              TN
            </div>
            <div>
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-emerald-700">
                TN Cleaning Solutions
              </p>
              <h1 className="text-lg font-semibold tracking-tight text-neutral-950">
                Admin Portal
              </h1>
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5" aria-label="Admin navigation">
          <p className="px-2 pb-3 text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-neutral-500">
            Navigation
          </p>
          <NavList pathname={pathname} />
        </nav>

        <div className="border-t border-emerald-950/10 p-4">
          <LogoutButton onLogout={onLogout} />
        </div>
      </aside>
    </>
  )
}