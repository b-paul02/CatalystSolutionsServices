import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { can } from "@/lib/leados/rbac";
import { entitlements } from "@/lib/os/entitlements";
import { APP_URL } from "@/lib/leados/email";
import { COMMON_ZONES, formatInZone } from "@/lib/os/time";
import { calendarEnabled } from "@/lib/os/calendar";
import { Badge, Card, Input, Label } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import GrowthStep from "@/components/os/GrowthStep";
import { Empty, field } from "@/components/os/bits";
import { bookingTypeSave, bookingTypeStatus, availabilitySave } from "./actions";

export const metadata = { title: "Booking" };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// WP-16 · Settings → Booking: create → configure → preview → activate; the host's weekly availability; upcoming bookings.
export default async function BookingSettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const actor = await requireOrgPage();
  const sp = await searchParams;
  const ent = await entitlements(actor.orgId);
  const canEdit = (can(actor.role, "os.settings") || can(actor.role, "leads.contact")) && ent.accessMode === "active";
  const [types, avail, upcoming, hosts] = await Promise.all([
    db.cosBookingType.findMany({ where: { orgId: actor.orgId }, orderBy: { createdAt: "asc" } }),
    db.cosAvailability.findMany({ where: { orgId: actor.orgId, userId: actor.userId }, orderBy: [{ weekday: "asc" }, { start: "asc" }] }),
    db.cosBooking.findMany({ where: { orgId: actor.orgId, status: "confirmed", startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 20 }),
    db.losMembership.findMany({ where: { orgId: actor.orgId }, include: { user: { select: { id: true, name: true, email: true } } } }),
  ]);
  const editing = sp.edit ? types.find((t) => t.id === sp.edit) ?? null : null;
  const hostName = (id: string) => { const h = hosts.find((x) => x.userId === id); return h?.user.name ?? h?.user.email ?? "host"; };
  const justLive = types.find((t) => t.status === "active" && Date.now() - t.updatedAt.getTime() < 60_000);
  return (
    <div className="space-y-6">
      {justLive && <GrowthStep done={`"${justLive.name}" is live.`} step={{ pillar: "client_acquisition", metric: "booking.bookings", metricLabel: "Bookings", action: { kind: "goal", label: "Set a bookings goal", title: `Bookings through "${justLive.name}"`, unit: "per month", horizon: "90 days" } }} />}
      <Card className="p-5 text-[13.5px]">
        <div className="mb-1 text-[15px] font-bold">Booking pages</div>
        <p className="mb-3 text-[13px] text-[var(--los-muted)]">A public page where a visitor picks a time with you. Every booking becomes a lead, a task for the host and a confirmation email.{calendarEnabled() ? " Google Calendar busy times are respected and the event is created for you." : " Google Calendar sync shows as “Awaiting approval” on Connections until the calendar scope is approved."}</p>
        <ul className="divide-y divide-[var(--los-line)]">
          {types.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0"><span className="font-semibold">{t.name}</span> <Badge tone={t.status === "active" ? "success" : t.status === "paused" ? "warn" : "neutral"}>{t.status}</Badge><div className="text-[12.5px] text-[var(--los-muted)]">{t.durationMin} min · host {hostName(t.hostId)} · {t.timezone}</div><div className="break-all text-[12px] text-[var(--los-faint)]">{APP_URL}/b/{t.id}</div></div>
              <div className="flex flex-wrap gap-2">
                <a href={`/app/b/${t.id}?preview=1`} target="_blank" rel="noreferrer" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-medium">Preview</a>
                {canEdit && <a href={`/app/settings/booking?edit=${t.id}`} className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-medium">Configure</a>}
                {canEdit && t.status !== "active" && <ActionForm action={bookingTypeStatus} submit="Activate" hidden={{ id: t.id, status: "active" }} />}
                {canEdit && t.status === "active" && <ActionForm action={bookingTypeStatus} submit="Pause" tone="ghost" hidden={{ id: t.id, status: "paused" }} />}
              </div>
            </li>
          ))}
          {types.length === 0 && <Empty>No booking page yet. Create one below, add your availability, preview it, then activate.</Empty>}
        </ul>
      </Card>

      {canEdit && (
        <Card className="p-5 text-[13.5px]">
          <div className="mb-2 text-[15px] font-bold">{editing ? `Configure “${editing.name}”` : "New booking page"}</div>
          <ActionForm action={bookingTypeSave} submit={editing ? "Save" : "Create draft"} hidden={editing ? { id: editing.id } : {}} className="grid gap-3 md:grid-cols-2">
            <div className="md:col-span-2"><Label>Name</Label><Input name="name" required defaultValue={editing?.name ?? ""} placeholder="30-minute discovery call" /></div>
            <div className="md:col-span-2"><Label>Description (shown on the page)</Label><Input name="description" defaultValue={editing?.description ?? ""} /></div>
            <div><Label>Duration (minutes)</Label><Input name="durationMin" type="number" min={10} max={240} defaultValue={editing?.durationMin ?? 30} /></div>
            <div><Label>Buffer after (minutes)</Label><Input name="bufferMin" type="number" min={0} max={120} defaultValue={editing?.bufferMin ?? 10} /></div>
            <div><Label>Host time zone</Label><select name="timezone" className={field} defaultValue={editing?.timezone ?? ent.timezone}>{COMMON_ZONES.map((z) => <option key={z}>{z}</option>)}</select></div>
            <div className="md:col-span-2"><Label>Questions to ask (one per line; end with * to make it required)</Label><textarea name="questions" rows={3} className={field} defaultValue={editing ? (JSON.parse(editing.questions) as { label: string; required: boolean }[]).map((q) => `${q.label}${q.required ? " *" : ""}`).join("\n") : "What would you like to talk about?"} /></div>
          </ActionForm>
          <p className="mt-2 text-[12px] text-[var(--los-faint)]">You are the host of the pages you create. One host per page (team round-robin is not built).</p>
        </Card>
      )}

      <Card className="p-5 text-[13.5px]">
        <div className="mb-1 text-[15px] font-bold">Your weekly availability</div>
        <p className="mb-3 text-[13px] text-[var(--los-muted)]">Times are in the booking page&apos;s zone. Leave a day blank to be unavailable.</p>
        {canEdit ? (
          <ActionForm action={availabilitySave} submit="Save availability" className="grid gap-2">
            {DAYS.map((d, i) => { const r = avail.find((a) => a.weekday === i); return <div key={d} className="grid grid-cols-[110px_1fr_1fr] items-center gap-2"><span>{d}</span><input name={`start_${i}`} type="time" defaultValue={r?.start ?? ""} className={field} aria-label={`${d} start`} /><input name={`end_${i}`} type="time" defaultValue={r?.end ?? ""} className={field} aria-label={`${d} end`} /></div>; })}
          </ActionForm>
        ) : <ul>{avail.map((a) => <li key={a.id}>{DAYS[a.weekday]} {a.start}–{a.end}</li>)}{avail.length === 0 && <li className="text-[var(--los-muted)]">None set.</li>}</ul>}
      </Card>

      <Card className="p-5 text-[13.5px]">
        <div className="mb-2 text-[15px] font-bold">Upcoming bookings</div>
        {upcoming.length === 0 ? <p className="text-[var(--los-muted)]">None yet.</p> : <ul className="divide-y divide-[var(--los-line)]">{upcoming.map((b) => <li key={b.id} className="flex flex-wrap justify-between gap-2 py-2"><span><b>{b.name}</b> · {types.find((t) => t.id === b.typeId)?.name}</span><span className="text-[var(--los-muted)]">{formatInZone(b.startAt, ent.timezone)}{b.leadId ? <> · <a className="underline" href={`/app/leads/${b.leadId}`}>lead</a></> : null}</span></li>)}</ul>}
      </Card>
    </div>
  );
}
