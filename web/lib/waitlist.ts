/**
 * The waitlist, stored in Resend.
 *
 * **Why Resend and not a database.** The only job this list has is to receive a
 * handful of broadcasts, and Resend is built for exactly that. There is no schema
 * to migrate, no connection to pool, and no second system to keep in sync with
 * the one that actually sends the email. At the 200-person cap we are a fifth of
 * the way to Resend's 1,000-contact limit, so the constraint is a product choice
 * (scarcity, a curated first cohort) rather than a technical ceiling.
 *
 * The trade-off: Resend holds `email` and `firstName` well, but richer
 * qualification (company, role, wallet) would need either a Resend contact
 * property or a real table. If we get there, add a Postgres table then — not now.
 *
 * Resend renamed "audiences" to **segments**; this module uses the current API and
 * resolves the segment by name at runtime, so there is no id to configure.
 */
import { Resend } from "resend";

export const WAITLIST_SEGMENT = "Offhrs Waitlist";
/** Soft cap, enforced before every insert. Override with `WAITLIST_CAP`. */
export const WAITLIST_CAP = Number(process.env.WAITLIST_CAP ?? 200);

/** What the form's action reports back. Lives here so the server-action file
 *  exports only functions. */
export type WaitlistResult =
  | { ok: true; status: "joined" | "already" }
  | { ok: false; reason: "invalid" | "full" | "error"; error: string };

type Segment = { id: string; name: string };

let cached: Resend | null = null;
function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured.");
  return (cached ??= new Resend(key));
}

// Single-flight: two concurrent first-signups must not both create the segment.
let segmentPromise: Promise<Segment> | null = null;
function segment(): Promise<Segment> {
  segmentPromise ??= (async () => {
    const resend = client();
    const listed = await resend.segments.list();
    if (listed.error) throw new Error(`${listed.error.name}: ${listed.error.message}`);
    const found = ((listed.data?.data ?? []) as Segment[]).find(
      (s) => s.name === WAITLIST_SEGMENT,
    );
    if (found) return found;
    const created = await resend.segments.create({ name: WAITLIST_SEGMENT });
    if (created.error) throw new Error(`${created.error.name}: ${created.error.message}`);
    return created.data as unknown as Segment;
  })();
  return segmentPromise;
}

/** Page through the segment and count. The list endpoint caps a page at 100. */
async function count(segmentId: string): Promise<number> {
  let total = 0;
  let after: string | undefined;
  for (;;) {
    const page = await client().contacts.list({ segmentId, limit: 100, after });
    if (page.error) throw new Error(`${page.error.name}: ${page.error.message}`);
    const data = (page.data?.data ?? []) as { id: string }[];
    total += data.length;
    if (!page.data?.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  return total;
}

export type JoinOutcome = "joined" | "already" | "full";

/**
 * Add one person. The cap is checked first so that a full list cannot be
 * over-filled, but a duplicate is still reported as `already` even when full —
 * someone who is on the list is never told the list is closed.
 */
export async function addToWaitlist(email: string, firstName?: string): Promise<JoinOutcome> {
  const seg = await segment();

  if ((await count(seg.id)) >= WAITLIST_CAP) {
    const existing = await client().contacts.get({ email });
    return existing.data ? "already" : "full";
  }

  const created = await client().contacts.create({
    email,
    ...(firstName ? { firstName } : {}),
    segments: [{ id: seg.id }],
  });
  if (created.error) {
    if (created.error.statusCode === 409 || /already exists/i.test(created.error.message)) {
      return "already";
    }
    throw new Error(`${created.error.name}: ${created.error.message}`);
  }
  return "joined";
}

/** Current size, or null when Resend is not configured / unreachable. */
export async function waitlistSize(): Promise<number | null> {
  try {
    return await count((await segment()).id);
  } catch {
    return null;
  }
}
