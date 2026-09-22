"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, EnvelopeSimple } from "@phosphor-icons/react";

import { joinWaitlist } from "@/app/(auth)/waitlist/actions";
import { Icon } from "@/components/ui/icon";
import type { WaitlistResult } from "@/lib/waitlist";

type State =
  | { k: "idle" }
  | { k: "sending" }
  | { k: "done"; status: "joined" | "already" }
  | { k: "error"; error: string };

/**
 * The waitlist form.
 *
 * Two fields, because a waitlist that asks for a company and a role converts
 * worse and the extra data only pays off once there is a second broadcast to
 * segment. Resend stores both natively.
 */
export function WaitlistForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [state, setState] = useState<State>({ k: "idle" });

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state.k === "sending") return;
    setState({ k: "sending" });
    let res: WaitlistResult;
    try {
      res = await joinWaitlist({ email, firstName });
    } catch {
      res = { ok: false, reason: "error", error: "Something went wrong. Try again in a moment." };
    }
    setState(res.ok ? { k: "done", status: res.status } : { k: "error", error: res.error });
    // Re-render the server side so the live counter above reflects the new entry
    // without a manual reload. The form keeps its own state across the refresh.
    if (res.ok) router.refresh();
  };

  if (state.k === "done") {
    return (
      <div className="panel flex flex-col items-start gap-4 p-7 sm:p-8">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-signal/10 text-signal">
          <Icon icon={Check} size={24} dither={false} />
        </span>
        <h2 className="font-display text-2xl leading-tight text-ink">
          {state.status === "already" ? "You're already on the list." : "You're on the list."}
        </h2>
        <p className="max-w-md text-sm leading-relaxed text-ink-dim">
          {state.status === "already"
            ? "Nothing to do — you'll get the same single email as everyone else."
            : "One email when your cohort opens. No drip campaign, no newsletter."}
        </p>
        <span className="mt-1 font-mono text-xs text-ink-faint">{email}</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="panel flex flex-col gap-5 p-7 sm:p-8">
      <div className="flex flex-col gap-2">
        <label htmlFor="wl-email" className="label">
          Email
        </label>
        <input
          id="wl-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full border-b border-edge bg-transparent pb-2 font-mono text-lg text-ink outline-none placeholder:text-ink-faint focus:border-signal"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="wl-name" className="label">
          First name <span className="text-ink-faint">(optional)</span>
        </label>
        <input
          id="wl-name"
          type="text"
          autoComplete="given-name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          placeholder="Ada"
          className="w-full border-b border-edge bg-transparent pb-2 font-mono text-lg text-ink outline-none placeholder:text-ink-faint focus:border-signal"
        />
      </div>

      <button
        type="submit"
        disabled={state.k === "sending"}
        className="btn btn-primary btn-lg mt-1 w-full disabled:opacity-50"
      >
        {state.k === "sending" ? (
          "Joining…"
        ) : (
          <>
            Join the waitlist
            <Icon icon={ArrowRight} size={16} dither={false} />
          </>
        )}
      </button>

      {state.k === "error" && (
        <p className="text-sm leading-relaxed text-ember">{state.error}</p>
      )}

      <p className="flex items-start gap-2 font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
        <Icon icon={EnvelopeSimple} size={14} dither={false} />
        <span>One email when we launch. And that's it.</span>
      </p>
    </form>
  );
}
