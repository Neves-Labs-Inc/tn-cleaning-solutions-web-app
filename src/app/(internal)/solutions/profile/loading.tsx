import { Skeleton } from '@/components/ui/skeleton'

// Heights mirror the loaded content at 375px so the swap does not jump.
export default function ProfileLoading() {
    return (
        <div className="mx-auto max-w-2xl space-y-6" aria-hidden="true">
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-67 w-full rounded-lg" />
            <Skeleton className="h-87 w-full rounded-lg" />
            <Skeleton className="h-82 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
        </div>
    )
}
