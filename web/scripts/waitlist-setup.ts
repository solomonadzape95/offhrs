/**
 * Verify and prepare the Resend waitlist.
 *
 *   pnpm exec tsx web/scripts/waitlist-setup.ts
 *
 * Resend's newer API calls an audience a **segment**. The app resolves the
 * segment by name at runtime, so this script is not required for signups to
 * work — it exists to prove the API key is valid, create the segment ahead of
 * the first visitor, and print how full the list is against the cap.
 */
import fs from "node:fs";

import { Resend } from "resend";

export const WAITLIST_SEGMENT = "Offhrs Waitlist";
export const WAITLIST_CAP = 200;

function apiKey(): string {
  if (process.env.RESEND_API_KEY) return process.env.RESEND_API_KEY;
  // `web/.env.local` is gitignored; read it directly so the script needs no dotenv.
  const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  const line = env.split("\n").find((l) => l.trim().startsWith("RESEND_API_KEY="));
  const value = line?.split("=").slice(1).join("=").trim();
  if (!value) throw new Error("RESEND_API_KEY is not set (env or web/.env.local).");
  return value;
}

async function main() {
  const resend = new Resend(apiKey());

  const listed = await resend.segments.list();
  if (listed.error) throw new Error(`${listed.error.name}: ${listed.error.message}`);
  const segments = (listed.data?.data ?? []) as { id: string; name: string }[];
  console.log(`segments: ${segments.map((s) => s.name).join(", ") || "(none)"}`);

  let segment = segments.find((s) => s.name === WAITLIST_SEGMENT);
  if (!segment) {
    const created = await resend.segments.create({ name: WAITLIST_SEGMENT });
    if (created.error) throw new Error(`${created.error.name}: ${created.error.message}`);
    segment = created.data as unknown as { id: string; name: string };
    console.log(`created segment "${WAITLIST_SEGMENT}"`);
  } else {
    console.log(`segment "${WAITLIST_SEGMENT}" already exists`);
  }

  // Count by paging, since the list endpoint returns a page at a time.
  let count = 0;
  let after: string | undefined;
  for (;;) {
    const page = await resend.contacts.list({ segmentId: segment.id, limit: 100, after });
    if (page.error) throw new Error(`${page.error.name}: ${page.error.message}`);
    const data = (page.data?.data ?? []) as { id: string }[];
    count += data.length;
    if (!page.data?.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }

  console.log(`segment id: ${segment.id}`);
  console.log(`contacts:   ${count} / ${WAITLIST_CAP}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
