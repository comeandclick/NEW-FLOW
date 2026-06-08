export default function MessagesLoading() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="h-6 w-24 bg-muted rounded animate-pulse" />
        <div className="h-7 w-28 bg-muted rounded animate-pulse" />
      </div>
      <div className="p-4 space-y-3">
        <div className="h-4 w-16 bg-muted rounded animate-pulse" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 bg-muted rounded animate-pulse" />
        ))}
      </div>
    </div>
  )
}
