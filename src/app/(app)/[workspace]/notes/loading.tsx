export default function NotesLoading() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="h-6 w-16 bg-muted rounded animate-pulse" />
        <div className="h-7 w-32 bg-muted rounded animate-pulse" />
      </div>
      <div className="px-6 py-3 border-b border-border">
        <div className="h-8 bg-muted rounded animate-pulse" />
      </div>
      <div className="p-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  )
}
