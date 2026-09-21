/**
 * A page section with the system's hairline label.
 *
 * Every marketing section shares the same shell: a rule-and-label marker at the
 * top, the app container, and vertical rhythm that steps up as the viewport
 * grows. Defining it once is what keeps two dozen sections from each inventing
 * their own padding.
 */
export function Section({
  children,
  id,
  label,
  className,
  /** Section headers are hidden on the page's own hero, which carries none. */
  bare = false,
}: {
  children: React.ReactNode;
  id?: string;
  label?: string;
  className?: string;
  bare?: boolean;
}) {
  return (
    <section id={id} className={`relative overflow-hidden border-t border-edge ${className ?? ""}`}>
      <div className={`relative mx-auto max-w-app px-5 sm:px-8 ${bare ? "py-0" : "py-16 sm:py-20 lg:py-28"}`}>
        {label && (
          <div className="mb-12 flex items-center gap-4">
            <span className="label whitespace-nowrap">{label}</span>
            <span aria-hidden className="h-px flex-1 bg-edge" />
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
