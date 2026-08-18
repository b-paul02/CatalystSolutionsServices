"use client";

// Scripted AI assistant demo — a keyword-matched decision tree, no API call.
// Content comes from lib/demos.ts so each industry runs its own brand and script.
// ponytail: keyword matching + quick replies; wire a real model only if a demo needs one.

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/Icon";
import type { ChatConfig } from "@/lib/demos";

type Msg = { from: "bot" | "user"; text: string };

export default function ChatDemo({ config }: { config: ChatConfig }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "bot", text: config.intro }]);
  const [chips, setChips] = useState<string[]>(config.chips);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [msgs, typing]);

  const send = (text: string) => {
    if (!text.trim() || typing) return;
    const hit = config.replies.find((r) => new RegExp(r.match, "i").test(text));
    setMsgs((m) => [...m, { from: "user", text }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setMsgs((m) => [...m, { from: "bot", text: hit ? hit.answer : config.fallback }]);
      setChips(hit?.followUps ?? config.chips.slice(0, 2));
      setTyping(false);
    }, 900);
  };

  return (
    <div className="flex h-[480px] flex-col overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[#0c0b16]">
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#16122a] px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-[18px] text-white" style={{ background: config.accent }}>
          <Icon name={config.icon} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-semibold text-white">{config.brand}</div>
          <div className="flex items-center gap-1.5 text-[11.5px] text-[#6EE7B7]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6EE7B7]" /> {config.status}
          </div>
        </div>
        <span className="ml-auto shrink-0 rounded-full border border-[rgba(168,85,247,0.3)] bg-[rgba(124,58,237,0.12)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-brand-soft)]">
          Demo
        </span>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          {msgs.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-[1.55] ${
                m.from === "bot" ? "self-start rounded-bl-md bg-white/[0.06] text-[var(--color-fg)]" : "self-end rounded-br-md text-white"
              }`}
              style={m.from === "user" ? { background: config.accent } : undefined}
            >
              {m.text}
            </div>
          ))}
          {typing && (
            <div className="self-start rounded-2xl rounded-bl-md bg-white/[0.06] px-4 py-3 text-[13px] text-[var(--color-faint)]">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-white/5 px-4 pb-4 pt-3">
        <div className="mb-2.5 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => send(c)}
              className="rounded-full border border-[rgba(168,85,247,0.35)] bg-[rgba(124,58,237,0.1)] px-3 py-1.5 text-[12px] font-medium text-[var(--color-brand-soft)] transition-colors hover:bg-[rgba(124,58,237,0.25)]"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message…" className="field flex-1 py-2.5 text-[13px]" aria-label="Chat message" />
          <button type="submit" className="flex h-[42px] w-[42px] items-center justify-center rounded-[10px] text-white" style={{ background: config.accent }} aria-label="Send">
            <Icon name="send" className="text-[18px]" />
          </button>
        </form>
      </div>
    </div>
  );
}
