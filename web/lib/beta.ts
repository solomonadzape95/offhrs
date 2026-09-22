/**
 * Beta / invite-only mode.
 *
 * While on, the product is not open yet: the only action is joining the
 * waitlist. App entry points are hidden from the marketing menu, and the calls
 * to action inside the landing page's sections render disabled rather than
 * linking into a half-open product.
 *
 * It defaults **on** — a build with no configuration is the pre-launch build —
 * and is turned off with `NEXT_PUBLIC_BETA=false`.
 */
export const BETA = process.env.NEXT_PUBLIC_BETA !== "false";

/** Menu destinations that only make sense once the product is open. */
export const APP_ENTRY_HREFS = ["/app", "/vault", "/launch"];
