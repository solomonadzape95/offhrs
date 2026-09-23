"use client";

import { useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

import { Icon } from "@/components/ui/icon";

/**
 * A code block with a copy affordance.
 *
 * The docs are read as much as they are copied from — seeds and instruction
 * names are the thing people paste into a script — so the copy button is the
 * only interactive part and the block itself stays monospace and quiet.
 */
export function CodeBlock({ label, code }: { label?: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard permission denied — the code is selectable anyway.
    }
  };

  return (
    <figure className="mt-5 overflow-hidden border border-edge bg-void-deep">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <figcaption className="font-mono text-[0.625rem] tracking-[0.16em] text-ink-faint uppercase">
          {label ?? "reference"}
        </figcaption>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label="Copy code"
          className="inline-flex items-center gap-1.5 font-mono text-[0.625rem] tracking-wider text-ink-faint uppercase transition-colors hover:text-signal"
        >
          <Icon icon={copied ? Check : Copy} size={12} dither={false} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-4">
        <code className="font-mono text-[0.8125rem] leading-relaxed whitespace-pre text-ink-dim">
          {code}
        </code>
      </pre>
    </figure>
  );
}
