export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />
}

export function TaskRowSkeleton() {
  return (
    <li className="glass-strong flex items-center justify-between gap-3 rounded-2xl px-5 py-4">
      <div className="min-w-0 flex-1">
        <Skeleton className="h-5 w-48 rounded-lg" />
        <Skeleton className="mt-2 h-3 w-28 rounded" />
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Skeleton className="h-7 w-10 rounded-xl" />
        <Skeleton className="h-8 w-14 rounded-xl" />
      </div>
    </li>
  )
}

export function TaskDetailSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 animate-fade-in sm:px-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <Skeleton className="h-4 w-48 rounded" />
        <Skeleton className="h-4 w-16 rounded" />
      </div>
      <div className="glass-strong rounded-3xl p-6">
        <Skeleton className="h-8 w-64 rounded-lg" />
        <div className="mt-4 flex flex-wrap gap-2">
          <Skeleton className="h-6 w-12 rounded-xl" />
          <Skeleton className="h-6 w-14 rounded-xl" />
        </div>
        <div className="mt-6 flex gap-3">
          <Skeleton className="h-9 w-24 rounded-2xl" />
          <Skeleton className="h-9 w-20 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <main className="w-full px-4 py-8 animate-fade-in sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-7 w-40 rounded-lg" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-2xl" />
          <Skeleton className="h-10 w-32 rounded-2xl" />
        </div>
      </div>
      <section className="mb-10">
        <Skeleton className="mb-4 h-3 w-28 rounded" />
        <ul className="space-y-3">
          {[1, 2, 3].map((i) => (
            <TaskRowSkeleton key={i} />
          ))}
        </ul>
      </section>
      <section>
        <Skeleton className="mb-4 h-3 w-20 rounded" />
        <ul className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <TaskRowSkeleton key={i} />
          ))}
        </ul>
      </section>
      <section className="mt-10">
        <Skeleton className="mb-4 h-3 w-36 rounded" />
        <ul className="space-y-3">
          {[1, 2].map((i) => (
            <li key={i} className="glass flex items-center justify-between rounded-2xl px-5 py-3">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="h-6 w-12 rounded-xl" />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
