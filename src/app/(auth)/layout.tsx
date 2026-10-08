export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background px-4 pt-[max(2rem,var(--safe-top))] pb-8 sm:flex sm:items-center sm:py-12">
      <div className="mx-auto w-full max-w-md space-y-6">
        <h1 className="text-center text-2xl font-semibold tracking-tight">TN Cleaning Solutions</h1>
        {children}
      </div>
    </div>
  )
}
