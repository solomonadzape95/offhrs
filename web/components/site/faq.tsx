"use client";

import { Plus } from "@phosphor-icons/react";
import { useState } from "react";

import type { FaqItem } from "@/lib/faq";

/**
 * An accordion built on a real button and an animated grid row.
 *
 * `<details>` would be less code but cannot be eased open without fighting the
 * browser, and the whole design leans on things resolving rather than snapping.
 * A grid row going `0fr → 1fr` animates to the content's natural height with no
 * measurement and no layout thrash, which is why there is no animation library
 * here.
 *
 * The first answer is open on load: an accordion that starts fully closed reads
 * as six headings and no content.
 */
export function FaqList({ items }: { items: FaqItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="border-t border-edge">
      {items.map((item, i) => {
        const isOpen = openIndex === i;

        return (
          <div key={item.q} className="border-b border-edge">
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="group flex w-full items-start justify-between gap-6 py-7 text-left outline-none focus-visible:bg-raised"
            >
              <span
                className={`text-lg transition-colors sm:text-xl ${
                  isOpen ? "text-ink" : "text-ink-dim group-hover:text-ink"
                }`}
              >
                {item.q}
              </span>
              <span
                className={`mt-1 shrink-0 transition-transform duration-300 ${
                  isOpen ? "rotate-45 text-signal" : "text-ink-faint group-hover:text-ink"
                }`}
              >
                <Plus size={22} weight="bold" aria-hidden />
              </span>
            </button>

            <div className="expando" data-open={isOpen}>
              <div>
                <p className="max-w-3xl pr-10 pb-8 text-base leading-relaxed text-ink-dim sm:text-lg">
                  {item.a}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
