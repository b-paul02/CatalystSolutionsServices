"use client";

import { useState } from "react";
import { Card, Label } from "@/components/leados/ui";

// WP-12 · Embed tab: script, iframe and link, each with a copy button.
export default function EmbedPanel({ publicId, publicUrl }: { publicId: string; publicUrl: string }) {
  const origin = publicUrl.replace(/\/app\/c\/.*$/, "");
  const snippets: [string, string, string][] = [
    ["Script (recommended — resizes itself)", `<script src="${origin}/s/form.js" data-form="${publicId}" async></script>`, "Paste where the form should appear. One line, no styling needed."],
    ["Iframe", `<iframe src="${publicUrl}?embed=1" style="width:100%;min-height:560px;border:0" title="Form" loading="lazy"></iframe>`, "For builders that block scripts. Fixed height."],
    ["Link", publicUrl, "For emails, WhatsApp, QR codes and social bios."],
  ];
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <Card className="max-w-[720px] space-y-4 p-5">
      {snippets.map(([label, code, help]) => (
        <div key={label}>
          <div className="flex items-center justify-between"><Label>{label}</Label><button type="button" className="text-[12.5px] font-semibold text-[var(--los-brand)]" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(label); setTimeout(() => setCopied(null), 1500); } catch { /* clipboard blocked */ } }}>{copied === label ? "Copied" : "Copy"}</button></div>
          <code className="block break-all rounded-lg bg-[var(--los-surface-2)] p-2.5 text-[12px]">{code}</code>
          <p className="mt-1 text-[12px] text-[var(--los-faint)]">{help}</p>
        </div>
      ))}
    </Card>
  );
}
