"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Multipart upload to /api/os/assets. Type, size and content are verified on the server.
export default function UploadForm({ assetId, canHide }: { assetId?: string; canHide: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<{ busy?: boolean; error?: string; ok?: string }>({});
  const field = "w-full rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-3 py-2 text-[13.5px]";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setState({ busy: true });
    try {
      const res = await fetch("/api/os/assets", { method: "POST", body: new FormData(form) });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setState({ error: json.error ?? "Upload failed — nothing was saved." });
      form.reset();
      setState({ ok: assetId ? "New version saved." : "Uploaded." });
      router.refresh();
    } catch {
      setState({ error: "Could not reach the server — check your connection and try again." });
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-2 text-[13.5px]" aria-busy={state.busy}>
      {assetId && <input type="hidden" name="assetId" value={assetId} />}
      <label className="flex flex-col gap-1">File<input type="file" name="file" required className={field} /></label>
      {!assetId && (
        <>
          <label className="flex flex-col gap-1">Name (optional)<input name="name" className={field} maxLength={200} /></label>
          <label className="flex flex-col gap-1">Type<select name="category" className={field}><option value="brand">Brand (logos, colours, fonts)</option><option value="source">Source material</option><option value="production">Production file</option><option value="deliverable">Deliverable</option></select></label>
          <label className="flex flex-col gap-1">Who owns it / usage rights<input name="rightsNote" className={field} placeholder="e.g. Owned by us · Licensed stock, web use only" maxLength={600} /></label>
        </>
      )}
      <label className="flex flex-col gap-1">Video length in seconds (videos only)<input name="durationSec" inputMode="numeric" className={field} /></label>
      {canHide && !assetId && <label className="flex items-center gap-2 text-[12.5px]"><input type="checkbox" name="clientVisible" value="off" /> Internal working file (not shown to the client)</label>}
      <button disabled={state.busy} className="justify-self-start rounded-lg bg-[var(--los-brand)] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">{state.busy ? "Uploading…" : assetId ? "Upload new version" : "Upload"}</button>
      <div aria-live="polite" className="text-[13px]">{state.error && <span role="alert" className="text-[var(--los-danger)]">{state.error}</span>}{state.ok && <span className="text-[var(--los-success)]">{state.ok}</span>}</div>
      <p className="text-[12px] text-[var(--los-faint)]">Images up to 15 MB, documents 25 MB, audio 50 MB, video 512 MB. Never upload passwords or login details.</p>
    </form>
  );
}
