export default function WorkspaceLoading() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="h-7 bg-muted rounded w-48 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
        <div className="h-48 bg-muted rounded-lg animate-pulse" />
      </div>
    </div>
  )
}
