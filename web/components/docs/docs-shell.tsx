"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUp, List } from "@phosphor-icons/react";

import { CodeBlock } from "@/components/docs/code-block";
import { Icon } from "@/components/ui/icon";
import type { DocBlock, DocGroup } from "@/lib/docs";

/**
 * The docs chrome: a sticky table of contents beside the body.
 *
 * The sidebar is a real scroll-spy rather than a static list of links — a docs
 * page is long, and the one useful thing a reader wants is to know where they
 * are. The mobile version collapses into a `<details>` so the body starts at the
 * top of the page instead of behind a wall of links.
 */
export function DocsShell({ groups }: { groups: DocGroup[] }) {
  const sections = useMemo(() => groups.flatMap((g) => g.sections), [groups]);
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const els = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // The top inset clears the fixed header; the bottom inset means a section
      // only takes over once it is meaningfully in view.
      { rootMargin: "-96px 0px -68% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <div className="mx-auto max-w-app px-5 pb-24 sm:px-8">
      <div className="grid gap-12 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] xl:gap-20">
        {/* Desktop table of contents */}
        <aside className="hidden lg:block">
          <nav className="sticky top-24 max-h-[calc(100svh-7rem)] overflow-y-auto pb-10">
            <span className="label">On this page</span>
            <div className="mt-5 flex flex-col gap-7">
              {groups.map((group) => (
                <div key={group.title}>
                  <span className="font-mono text-[0.625rem] tracking-[0.16em] text-ink-faint uppercase">
                    {group.title}
                  </span>
                  <ul className="mt-3 flex flex-col border-l border-edge">
                    {group.sections.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className={`-ml-px block border-l py-1.5 pl-4 text-sm transition-colors ${
                            active === s.id
                              ? "border-signal text-signal"
                              : "border-transparent text-ink-dim hover:border-ink-faint hover:text-ink"
                          }`}
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>
        </aside>

        <div className="min-w-0">
          {/* Mobile table of contents */}
          <details className="group mb-10 border border-edge bg-surface/80 lg:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5">
              <span className="flex items-center gap-2.5">
                <Icon icon={List} size={15} dither={false} />
                <span className="label !text-ink-dim">On this page</span>
              </span>
              <span className="font-mono text-[0.625rem] text-ink-faint uppercase group-open:hidden">
                Open
              </span>
              <span className="hidden font-mono text-[0.625rem] text-ink-faint uppercase group-open:inline">
                Close
              </span>
            </summary>
            <ul className="grid grid-cols-1 gap-0.5 border-t border-edge p-2 sm:grid-cols-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="block px-3 py-2 text-sm text-ink-dim transition-colors hover:bg-raised hover:text-ink"
                  >
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </details>

          <div className="flex flex-col gap-20">
            {groups.map((group) => (
              <div key={group.title} className="flex flex-col gap-16">
                <span className="label -mb-6">{group.title}</span>
                {group.sections.map((section) => (
                  <section key={section.id} id={section.id} className="scroll-mt-28">
                    <h2 className="font-display text-3xl leading-tight text-ink sm:text-4xl">
                      {section.title}
                    </h2>
                    <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-dim">
                      {section.summary}
                    </p>
                    <div className="mt-6 flex flex-col">
                      {section.blocks.map((block, i) => (
                        <Block key={i} block={block} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ))}
          </div>

          <a
            href="#top"
            className="mt-20 inline-flex items-center gap-2 font-mono text-[0.6875rem] tracking-wider text-ink-faint uppercase transition-colors hover:text-signal"
          >
            <Icon icon={ArrowUp} size={13} dither={false} />
            Back to top
          </a>
        </div>
      </div>
    </div>
  );
}

function Block({ block }: { block: DocBlock }) {
  switch (block.kind) {
    case "p":
      return <p className="mt-4 leading-relaxed text-ink-dim">{block.text}</p>;

    case "list":
      return (
        <ul className="mt-4 flex flex-col gap-3">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3.5 leading-relaxed text-ink-dim">
              <span aria-hidden className="mt-2.5 block size-1 shrink-0 bg-signal" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );

    case "steps":
      return (
        <ol className="mt-5 flex flex-col gap-px border border-edge bg-edge">
          {block.items.map((item, i) => (
            <li key={item.title} className="flex gap-4 bg-void px-5 py-5">
              <span className="font-mono text-xs text-signal-dim">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0">
                <span className="block text-[0.9375rem] text-ink">{item.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-ink-dim">
                  {item.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      );

    case "code":
      return <CodeBlock label={block.label} code={block.code} />;

    case "callout": {
      const tone =
        block.tone === "ember"
          ? "border-ember/40 bg-ember/[0.06]"
          : block.tone === "signal"
            ? "border-signal-dim/60 bg-signal/[0.06]"
            : "border-edge bg-surface/70";
      const title = block.tone === "ember" ? "text-ember" : "text-signal";
      return (
        <div className={`mt-5 border px-5 py-4 ${tone}`}>
          <span className={`font-mono text-[0.625rem] tracking-[0.16em] uppercase ${title}`}>
            {block.title}
          </span>
          <p className="mt-2 leading-relaxed text-ink-dim">{block.text}</p>
        </div>
      );
    }

    case "table":
      return (
        <div className="mt-5 overflow-x-auto border border-edge">
          <table className="w-full min-w-140 border-collapse">
            <thead>
              <tr className="border-b border-edge bg-surface/60">
                {block.head.map((h, i) => (
                  <th
                    key={h}
                    className={`label px-4 py-3 ${i === 0 ? "text-left" : "text-left"}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-edge/60 last:border-b-0">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`px-4 py-3 align-top text-sm leading-relaxed ${
                        block.mono?.includes(c)
                          ? "font-mono text-[0.8125rem] text-ink-dim"
                          : c === 0
                            ? "text-ink"
                            : "text-ink-dim"
                      }`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}
