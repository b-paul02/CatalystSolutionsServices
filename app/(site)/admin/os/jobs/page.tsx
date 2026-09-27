import Link from "next/link";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { schedulerHealth, STALE_AFTER_MIN } from "@/lib/os/tick";
import AdminForm from "../AdminForm";
import { killJob, retryJob } from "./actions";

export const metadata = { title: "Jobs — operator" };
export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-[12px] font-semibold text-[var(--color-faint)]", td = "px-3 py-1.5 align-top";
const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");

// WP-02 · the queue at a glance: counts, last tick, and per-job retry / kill. Platform role only.
export default async function JobsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatform();
  const sp = await searchParams;
  const status = ["pending", "running", "dead", "done"].includes(sp.status ?? "") ? sp.status! : "";
  const [health, counts, jobs] = await Promise.all([
    schedulerHealth(),
    db.losJob.groupBy({ by: ["status"], _count: true }),
    db.losJob.findMany({ where: status ? { status } : { status: { not: "done" } }, orderBy: [{ status: "asc" }, { runAt: "desc" }], take: 100 }),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const stuckAt = new Date(Date.now() - 30 * 60_000);
  return (
    <div className="shell py-8">
      <Link href="/admin/os" className="text-[12.5px] text-[var(--color-muted)] hover:text-white">← GrowthOS</Link>
      <h1 className="mb-1 text-2xl font-extrabold text-white">Background jobs</h1>
      <p className="mb-5 text-[13.5px] text-[var(--color-muted)]">
        Scheduler last ran {health.lastRun ? when(health.lastRun) : "never"}{health.stale ? <span className="text-red-400"> — STALE (no tick in {STALE_AFTER_MIN} min: scheduled posts and waits are not moving)</span> : " · healthy"}.
      </p>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {[["pending", "Pending"], ["running", "Running"], ["dead", "Dead"], ["done", "Done"]].map(([s, l]) => (
          <Link key={s} href={`/admin/os/jobs?status=${s}`} className={`card !p-4 hover:border-[var(--color-brand)] ${status === s ? "border-[var(--color-brand)]" : ""}`}>
            <div className="text-[12.5px] text-[var(--color-muted)]">{l}</div>
            <div className={`text-[26px] font-extrabold ${s === "dead" && n(s) > 0 ? "text-red-400" : "text-white"}`}>{n(s)}</div>
          </Link>
        ))}
        <div className="card !p-4"><div className="text-[12.5px] text-[var(--color-muted)]">Stuck (running &gt; 30 min)</div><div className={`text-[26px] font-extrabold ${health.stuckJobs > 0 ? "text-amber-400" : "text-white"}`}>{health.stuckJobs}</div></div>
      </div>
      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[820px] text-[13px] text-white">
          <thead><tr className="border-b border-[var(--color-line)]"><th className={th}>Type</th><th className={th}>Status</th><th className={th}>Attempts</th><th className={th}>Run at</th><th className={th}>Last error</th><th className={th}></th></tr></thead>
          <tbody>
            {jobs.map((j) => {
              const stuck = j.status === "running" && j.lockedAt && j.lockedAt < stuckAt;
              return (
                <tr key={j.id} className="border-b border-[var(--color-line)]">
                  <td className={td}><div className="font-medium">{j.type}</div><div className="text-[11.5px] text-[var(--color-faint)]">{j.id}{j.idempotencyKey ? ` · ${j.idempotencyKey.slice(0, 60)}` : ""}</div></td>
                  <td className={td}><span className={j.status === "dead" ? "text-red-400" : stuck ? "text-amber-400" : ""}>{j.status}{stuck ? " (stuck)" : ""}</span></td>
                  <td className={td}>{j.attempts}/{j.maxAttempts}</td>
                  <td className={td}>{when(j.runAt)}</td>
                  <td className={`${td} max-w-[320px] break-words text-[12px] text-[var(--color-muted)]`}>{j.lastError?.slice(0, 240) ?? "—"}</td>
                  <td className={td}>
                    <div className="flex gap-2">
                      {(j.status === "dead" || stuck) && <AdminForm action={retryJob} submit="Retry" hidden={{ id: j.id }} />}
                      {(j.status === "pending" || j.status === "running") && <AdminForm action={killJob} submit="Kill" hidden={{ id: j.id }} confirm="Mark this job dead? It will never run." />}
                    </div>
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 && <tr><td className={`${td} text-[var(--color-faint)]`} colSpan={6}>Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
