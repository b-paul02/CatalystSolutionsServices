import Link from "next/link";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { ERROR_RETENTION_DAYS } from "@/lib/os/errors";
import AdminForm from "../AdminForm";
import { resolveError } from "./actions";

export const metadata = { title: "Errors — operator" };
export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-[12px] font-semibold text-[var(--color-faint)]", td = "px-3 py-1.5 align-top";
const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") : "—");

// WP-03 · request errors grouped by fingerprint. Kept ERROR_RETENTION_DAYS after they were last seen.
export default async function ErrorsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePlatform();
  const sp = await searchParams;
  const rows = await db.cosErrorEvent.findMany({ where: sp.all ? {} : { resolvedAt: null }, orderBy: { lastAt: "desc" }, take: 200 });
  const orgs = new Map((await db.losOrg.findMany({ where: { id: { in: rows.map((r) => r.orgId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((o) => [o.id, o.name]));
  return (
    <div className="shell py-8">
      <Link href="/admin/os" className="text-[12.5px] text-[var(--color-muted)] hover:text-white">← GrowthOS</Link>
      <h1 className="mb-1 text-2xl font-extrabold text-white">Application errors</h1>
      <p className="mb-5 text-[13.5px] text-[var(--color-muted)]">One row per distinct error (message + route); repeats are counted. Request bodies and personal data are never stored. Swept after {ERROR_RETENTION_DAYS} days. <Link className="underline" href={sp.all ? "/admin/os/errors" : "/admin/os/errors?all=1"}>{sp.all ? "Hide resolved" : "Show resolved too"}</Link></p>
      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[820px] text-[13px] text-white">
          <thead><tr className="border-b border-[var(--color-line)]"><th className={th}>Error</th><th className={th}>Route</th><th className={th}>Count</th><th className={th}>First</th><th className={th}>Last</th><th className={th}></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--color-line)]">
                <td className={`${td} max-w-[420px]`}><div className="font-medium break-words">{r.message}</div>{r.orgId && <div className="text-[11.5px] text-[var(--color-faint)]">{orgs.get(r.orgId) ?? r.orgId}</div>}{r.stack && <details className="mt-1 text-[11.5px] text-[var(--color-faint)]"><summary className="cursor-pointer">stack</summary><pre className="whitespace-pre-wrap">{r.stack}</pre></details>}</td>
                <td className={`${td} text-[12px] text-[var(--color-muted)]`}>{r.route ?? "—"}</td>
                <td className={td}>{r.count}</td><td className={td}>{when(r.firstAt)}</td><td className={td}>{when(r.lastAt)}</td>
                <td className={td}>{r.resolvedAt ? <span className="text-[12px] text-green-400">resolved</span> : <AdminForm action={resolveError} submit="Resolve" hidden={{ id: r.id }} />}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={`${td} text-[var(--color-faint)]`} colSpan={6}>No errors recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
