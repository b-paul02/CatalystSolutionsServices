"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { submitRequestedInfo } from "./actions";

export default function EditForm({ token, fields, values }: {
  token: string;
  fields: { key: string; label: string; kind: "text" | "long" | "number" }[];
  values: Record<string, string | number>;
}) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, String(values[f.key] ?? "")])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true); setError(null);
    try {
      await submitRequestedInfo(token, v);
      router.push(`/partners/apply/status/${token}`);
      return;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
    setBusy(false);
  }

  return (
    <div className="grid gap-4">
      {fields.map((f) => (
        <div key={f.key} className="flex flex-col gap-[7px]">
          <label className="label">{f.label}</label>
          {f.kind === "long" ? (
            <textarea className="field resize-y" rows={4} value={v[f.key]} onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
          ) : (
            <input className="field" type={f.kind === "number" ? "number" : "text"} value={v[f.key]}
                   onChange={(e) => setV({ ...v, [f.key]: e.target.value })} />
          )}
        </div>
      ))}
      {error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13px] text-red-300">{error}</p>}
      <button onClick={save} disabled={busy} className="btn-primary mt-1 w-full justify-center disabled:opacity-60">
        {busy ? "Sending…" : "Send updates"}
      </button>
    </div>
  );
}
