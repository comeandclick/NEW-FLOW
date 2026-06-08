export default function TasksLoading() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="h-6 w-20 bg-muted rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-7 w-24 bg-muted rounded animate-pulse" />
          <div className="h-7 w-28 bg-muted rounded animate-pulse" />
        </div>
      </div>
      <div className="flex gap-3 p-4 overflow-x-auto flex-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-72 shrink-0 rounded-lg border border-border bg-muted/30 animate-pulse"
          >
            <div className="px-3 py-2.5 border-b border-border">
              <div className="h-4 w-20 bg-muted rounded" />
            </div>
            <div className="p-2 space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="h-20 bg-muted rounded-md" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
