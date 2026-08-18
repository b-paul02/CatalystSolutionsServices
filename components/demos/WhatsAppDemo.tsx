"use client";

// Auto-playing WhatsApp scene: an enquiry arrives out of hours and is qualified,
// answered and booked with no human involved. Script comes from lib/demos.ts.

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { WaConfig } from "@/lib/demos";

export default function WhatsAppDemo({ config }: { config: WaConfig }) {
  const [count, setCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const script = config.script;

  useEffect(() => {
    if (count >= script.length) return;
    const step = script[count];
    setTyping(step.from === "bot");
    const t = setTimeout(() => {
      setTyping(false);
      setCount((c) => c + 1);
    }, step.delay);
    return () => clearTimeout(t);
  }, [count, script]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [count, typing]);

  return (
    <div className="flex h-[480px] flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[#0b141a]">
      <div className="flex items-center gap-3 bg-[#1f2c34] px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-white" style={{ background: config.accent }}>
          <Icon name={config.icon} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-white">{config.brand}</div>
          <div className="truncate text-[11.5px] text-[#8696a0]">{config.status}</div>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(124,58,237,0.2)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-brand-soft)]">
          Demo
        </span>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4 [background:radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.02),transparent_40%),#0b141a]">
        <div className="flex flex-col gap-2.5">
          {script.slice(0, count).map((m, i) =>
            m.from === "event" ? (
              <div key={i} className="self-center rounded-lg bg-[#182229] px-3 py-1.5 text-center text-[11.5px] text-[#8696a0]">{m.text}</div>
            ) : (
              <div key={i} className={`max-w-[85%] rounded-lg px-3 py-2 text-[13px] leading-[1.5] ${m.from === "bot" ? "self-start bg-[#1f2c34] text-[#e9edef]" : "self-end bg-[#005c4b] text-[#e9edef]"}`}>
                {m.text}
                <span className="mt-0.5 block text-right text-[10px] text-white/40">
                  9:1{Math.min(i, 9)} PM {m.from === "bot" && "✓✓"}
                </span>
              </div>
            )
          )}
          {typing && (
            <div className="self-start rounded-lg bg-[#1f2c34] px-4 py-2.5 text-[13px] text-[#8696a0]">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/5 bg-[#1f2c34] px-4 py-3">
        {count >= script.length ? (
          <button type="button" onClick={() => setCount(0)} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#005c4b] py-2.5 text-[13px] font-semibold text-white">
            <Icon name="replay" className="text-[17px]" /> Replay the conversation
          </button>
        ) : (
          <div className="text-center text-[12px] text-[#8696a0]">Watching a real automated sequence — no human involved…</div>
        )}
      </div>
    </div>
  );
}
