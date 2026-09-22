/**
 * Route-level loading state.
 *
 * Rendered by the `loading.tsx` files so a slow server render shows motion the
 * moment navigation starts, rather than a blank frame. The animation itself is
 * `.loader` in `globals.css`.
 */
export function PageLoader({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-[60svh] flex-col items-center justify-center gap-6">
      <div className="loader" role="status" aria-label={label} />
      <span className="font-mono text-[0.6875rem] tracking-[0.2em] text-ink-faint uppercase">
        {label}
      </span>
    </div>
  );
}
