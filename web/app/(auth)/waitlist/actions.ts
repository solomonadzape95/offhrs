"use server";

import { addToWaitlist, type WaitlistResult } from "@/lib/waitlist";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Join the waitlist.
 *
 * Server-side so the Resend key never reaches the browser, and so the cap is
 * enforced where it cannot be bypassed. The response deliberately does not say
 * whether an address was already present beyond a friendly "you're already on
 * it" — it never confirms membership to someone probing addresses.
 */
export async function joinWaitlist(input: {
  email: string;
  firstName?: string;
}): Promise<WaitlistResult> {
  const email = (input.email ?? "").trim().toLowerCase();
  const firstName = (input.firstName ?? "").trim().slice(0, 80);

  if (!EMAIL.test(email)) {
    return { ok: false, reason: "invalid", error: "Enter a valid email address." };
  }

  try {
    const outcome = await addToWaitlist(email, firstName || undefined);
    if (outcome === "full") {
      return {
        ok: false,
        reason: "full",
        error: "This cohort is full. We keep it small on purpose — the next one opens soon.",
      };
    }
    return { ok: true, status: outcome };
  } catch (e) {
    if (process.env.NODE_ENV !== "production") {
      console.error("[waitlist]", e);
    }
    return {
      ok: false,
      reason: "error",
      error: "Something went wrong on our end. Try again in a moment.",
    };
  }
}
