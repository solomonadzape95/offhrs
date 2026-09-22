/**
 * Send — or draft — a broadcast to the waitlist.
 *
 *   pnpm exec tsx web/scripts/waitlist-broadcast.ts "Your cohort is open"
 *   pnpm exec tsx web/scripts/waitlist-broadcast.ts "Your cohort is open" --body ./email.html --send
 *
 * It **defaults to a draft**: the broadcast is created in Resend so you can read
 * it in the dashboard and hit send there, and only goes out from here when you
 * pass `--send`. Mailing real people should never be the accidental default.
 *
 * The `from` address is set *here* (via `WAITLIST_FROM`), not by Resend. Any
 * local part at a verified domain works — `hello@`, `waitlist@`, `team@` — and
 * the display name is free text. The only requirement is that the domain's
 * sending records (DKIM + SPF) are verified, which `offhrs.fun`'s are.
 */
import fs from "node:fs";

import { Resend } from "resend";

import { WAITLIST_SEGMENT } from "../lib/waitlist";

const DEFAULT_FROM = "Offhrs <hello@offhrs.fun>";

function loadEnvLocal() {
  try {
    const raw = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  } catch {
    // No .env.local — rely on the real environment.
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function defaultBody(): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#0b0b0d;color:#e8e8ea;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:48px 28px">
      <p style="margin:0 0 32px;font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#8a8a93">offhrs</p>
      <h1 style="margin:0 0 16px;font-size:28px;line-height:1.2;font-weight:600">
        Your cohort is open.
      </h1>
      <p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#b6b6bd">
        You joined the Offhrs waitlist early, so you're in the first group. Agents that
        trade tokenized pre-IPO equity while the reference market is closed — and pay
        holders in the shares themselves.
      </p>
      <p style="margin:0 0 32px">
        <a href="https://offhrs.fun" style="display:inline-block;background:#7c5cff;color:#0b0b0d;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:2px">
          Open Offhrs
        </a>
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:#6f6f78">
        You're getting this because you joined the waitlist at offhrs.fun. Unsubscribe in one click.
      </p>
    </div>
  </body>
</html>`;
}

/** A crude HTML→text fallback so every broadcast carries a plain-text part. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  loadEnvLocal();

  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set (env or web/.env.local).");

  const subject = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : undefined;
  if (!subject) {
    console.error('Usage: pnpm exec tsx web/scripts/waitlist-broadcast.ts "Subject" [--body file.html] [--send]');
    process.exit(1);
  }

  const from = arg("from") ?? process.env.WAITLIST_FROM ?? DEFAULT_FROM;
  const replyTo = arg("reply-to") ?? process.env.WAITLIST_REPLY_TO;
  const bodyPath = arg("body");
  const html = bodyPath ? fs.readFileSync(bodyPath, "utf8") : defaultBody();
  const text = htmlToText(html);
  const send = process.argv.includes("--send");

  const resend = new Resend(key);

  // Resolve the segment by name, same as the app.
  const listed = await resend.segments.list();
  if (listed.error) throw new Error(`${listed.error.name}: ${listed.error.message}`);
  const segment = ((listed.data?.data ?? []) as { id: string; name: string }[]).find(
    (s) => s.name === WAITLIST_SEGMENT,
  );
  if (!segment) throw new Error(`Segment "${WAITLIST_SEGMENT}" not found — run waitlist-setup first.`);

  // Warn if the sending domain is not verified, because the send will fail.
  const domains = await resend.domains.list();
  const domainName = from.match(/@([^>\s]+)/)?.[1];
  const domain = ((domains.data?.data ?? []) as { name: string; status: string }[]).find(
    (d) => d.name === domainName,
  );
  console.log(`from     ${from}`);
  if (replyTo) console.log(`reply-to ${replyTo}`);
  console.log(`segment  ${segment.name} (${segment.id})`);
  console.log(`domain   ${domainName ?? "—"}  status=${domain?.status ?? "unknown"}`);
  if (domain && domain.status !== "verified") {
    console.log(
      `         note: "${domain.status}" still sends if DKIM + SPF are verified; ` +
        `check the Resend dashboard for which record is outstanding.`,
    );
  }

  const created = await resend.broadcasts.create({
    name: subject,
    from,
    ...(replyTo ? { replyTo } : {}),
    subject,
    html,
    text,
    segmentId: segment.id,
    send,
    // The SDK's `RequireAtLeastOne<SegmentOptions>` resolves to the legacy
    // `audienceId` overload; `segmentId` is the current field and the API accepts it.
  } as never);
  if (created.error) throw new Error(`${created.error.name}: ${created.error.message}`);

  console.log(`\n${send ? "SENT" : "DRAFT"} broadcast ${created.data?.id}`);
  if (!send) {
    console.log("Review it in Resend, then send it there — or rerun with --send.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
