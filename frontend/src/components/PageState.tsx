export function PageLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <div className="h-7 w-48 rounded bg-muted animate-pulse" />
      <div className="h-24 rounded-lg bg-muted animate-pulse" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function PageError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-red-50 p-4 text-sm" role="alert">
      <p className="font-medium text-destructive">Something went wrong</p>
      <p className="mt-1 text-foreground">{message}</p>
      {onRetry && (
        <button type="button" className="mt-3 text-sm underline" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function PageEmpty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-8 text-center">
      <h2 className="font-semibold text-primary">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
