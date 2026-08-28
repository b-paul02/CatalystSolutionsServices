"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/Icon";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const res = await fetch("/api/admin/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/admin/reviews");
      router.refresh();
    } else {
      setError((await res.json()).error ?? "Login failed.");
      setBusy(false);
    }
  }

  return (
    <section className="flex min-h-[70vh] items-center justify-center px-5 py-20">
      <form onSubmit={submit} className="card w-full max-w-[400px]">
        <span className="icon-grad mx-auto mb-5 flex h-12 w-12 text-[24px]"><Icon name="admin_panel_settings" /></span>
        <h1 className="mb-1 text-center text-[22px] font-bold text-white">Admin portal</h1>
        <p className="mb-6 text-center text-[13px] text-[var(--color-faint)]">Catalyst Solutions Services</p>
        <label className="label mb-1.5 block">Email</label>
        <input className="field mb-4" type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="label mb-1.5 block">Password</label>
        <input className="field mb-5" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="mb-4 text-[13px] text-red-400">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </section>
  );
}
