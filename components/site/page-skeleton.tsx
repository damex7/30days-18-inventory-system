/** A calm placeholder while a signed-in page waits for the database. */
export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="space-y-6">
      <div className="skeleton h-9 w-64 max-w-full" />
      <div className="skeleton h-5 w-96 max-w-full" />
      <div className="skeleton h-48 w-full rounded-card" />
      <div className="skeleton h-32 w-full rounded-card" />
    </div>
  )
}
