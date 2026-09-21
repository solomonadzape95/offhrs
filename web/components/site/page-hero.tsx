/**
 * The header block every secondary page opens with.
 *
 * The landing page argues with a full-viewport hero; the pages behind it just need
 * to say where you are and what the page is for. Sharing one block keeps the
 * eyebrow / display title / intro rhythm identical across them, so a new page
 * cannot invent its own header proportions.
 */
export function PageHero({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  intro?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="mx-auto max-w-app px-5 pt-16 pb-4 sm:px-8 sm:pt-24">
      <span className="label">{eyebrow}</span>
      <h1 className="font-display text-headline mt-6 max-w-4xl text-balance text-ink">{title}</h1>
      {intro && (
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-dim text-pretty">{intro}</p>
      )}
      {children && <div className="mt-9">{children}</div>}
    </section>
  );
}
