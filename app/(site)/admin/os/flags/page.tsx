import Link from "next/link";
import { db } from "@/lib/audit/db";
import { requirePlatform } from "@/lib/leados/auth";
import { FEATURE_KEYS } from "@/lib/os/flags";
import AdminForm from "../AdminForm";
import { toggleFlag } from "./actions";

export const metadata = { title: "Feature flags — operator" };
export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-[12px] font-semibold text-[var(--color-faint)]", td = "px-3 py-1.5 align-top";
const input = "rounded-lg border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-white";

// WP-06 · global switch per feature, plus per-workspace overrides. No row = on. Kill switch is separate.
export default async function FlagsAdminPage() {
  await requirePlatform();
  const [rows, orgs] = await Promise.all([db.cosFeatureFlag.findMany({ orderBy: [{ key: "asc" }, { orgId: "asc" }] }), db.losOrg.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 })]);
  const name = (id: string) => (id === "" ? "GLOBAL" : orgs.find((o) => o.id === id)?.name ?? id);
  return (
    <div className="shell py-8">
      <Link href="/admin/os" className="text-[12.5px] text-[var(--color-muted)] hover:text-white">← GrowthOS</Link>
      <h1 className="mb-1 text-2xl font-extrabold text-white">Feature flags</h1>
      <p className="mb-5 text-[13.5px] text-[var(--color-muted)]">Checked by the action gate immediately before a publish, send or launch. A workspace row overrides the global one; a feature with no row is on. The kill switch is separate and always wins.</p>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <div className="card !p-4">
          <div className="mb-2 text-[15px] font-bold text-white">Global</div>
          <table className="w-full text-[13px] text-white"><thead><tr><th className={th}>Feature</th><th className={th}>State</th><th className={th}></th></tr></thead><tbody>
            {FEATURE_KEYS.map((k) => { const r = rows.find((x) => x.key === k && x.orgId === ""); const on = r?.on ?? true; return (
              <tr key={k} className="border-b border-[var(--color-line)]"><td className={td}>{k}</td><td className={td}><span className={on ? "text-green-400" : "text-red-400"}>{on ? "on" : "OFF"}</span>{r?.note && <div className="text-[11.5px] text-[var(--color-faint)]">{r.note}</div>}</td><td className={td}><AdminForm action={toggleFlag} submit={on ? "Switch off" : "Switch on"} hidden={{ key: k, orgId: "", on: String(!on) }} confirm={on ? `Switch ${k} OFF for every workspace?` : undefined} /></td></tr>
            ); })}
          </tbody></table>
        </div>
        <AdminForm action={toggleFlag} submit="Save override" title="Workspace override">
          <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Feature<select name="key" className={input}>{FEATURE_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Workspace<select name="orgId" className={input}>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">State<select name="on" className={input}><option value="true">on</option><option value="false">off</option></select></label>
          <label className="flex flex-col gap-1 text-[12.5px] text-[var(--color-muted)]">Note<input name="note" className={input} placeholder="why" /></label>
        </AdminForm>
      </div>
      <div className="card overflow-x-auto !p-0">
        <table className="w-full min-w-[640px] text-[13px] text-white"><thead><tr className="border-b border-[var(--color-line)]"><th className={th}>Feature</th><th className={th}>Workspace</th><th className={th}>State</th><th className={th}>Note</th><th className={th}>By</th><th className={th}></th></tr></thead><tbody>
          {rows.filter((r) => r.orgId !== "").map((r) => (
            <tr key={r.id} className="border-b border-[var(--color-line)]"><td className={td}>{r.key}</td><td className={td}>{name(r.orgId)}</td><td className={td}><span className={r.on ? "text-green-400" : "text-red-400"}>{r.on ? "on" : "OFF"}</span></td><td className={`${td} text-[var(--color-muted)]`}>{r.note ?? ""}</td><td className={`${td} text-[var(--color-faint)]`}>{r.updatedBy ?? ""}</td><td className={td}><AdminForm action={toggleFlag} submit="Remove override" hidden={{ key: r.key, orgId: r.orgId, remove: "1" }} /></td></tr>
          ))}
          {rows.filter((r) => r.orgId !== "").length === 0 && <tr><td className={`${td} text-[var(--color-faint)]`} colSpan={6}>No workspace overrides.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}
