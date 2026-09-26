// WP-16 · public booking page: month grid → slots in the visitor's zone → form → confirmation. Drafts open only with
// ?preview=1 for a signed-in member of the workspace.
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { currentLosActor } from "@/lib/leados/auth";
import { slotsForDay, type Question } from "@/lib/os/booking";
import { validTimeZone } from "@/lib/os/time";
import BookingClient from "./BookingClient";

export const metadata = { title: "Book a time", robots: { index: false } };

export default async function PublicBookingPage({ params, searchParams }: { params: Promise<{ typeId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { typeId } = await params;
  const sp = await searchParams;
  const type = await db.cosBookingType.findUnique({ where: { id: typeId } });
  if (!type) notFound();
  if (type.status !== "active") {
    const actor = sp.preview === "1" ? await currentLosActor() : null;
    const member = actor ? await db.losMembership.findFirst({ where: { orgId: type.orgId, userId: actor.userId } }) : null;
    if (!member) notFound();
  }
  const [org, host] = await Promise.all([db.losOrg.findUnique({ where: { id: type.orgId }, select: { name: true } }), db.losUser.findUnique({ where: { id: type.hostId }, select: { name: true } })]);
  const tz = sp.tz && validTimeZone(sp.tz) ? sp.tz : type.timezone;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  const slots = day ? await slotsForDay(type, day, tz) : [];
  // days with any slot this month (for the grid) — cheap: one query per day is avoided by checking availability weekdays only
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7);
  const avail = await db.cosAvailability.findMany({ where: { orgId: type.orgId, userId: type.hostId }, select: { weekday: true } });
  const weekdays = new Set(avail.map((a) => a.weekday));
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8" style={{ background: "var(--los-bg)" }}>
      <div className="w-full max-w-[720px] rounded-2xl border border-[var(--los-line)] bg-[var(--los-surface)] p-6 sm:p-8">
        <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--los-faint)]">{org?.name}{type.status !== "active" ? " · PREVIEW (not live)" : ""}</div>
        <h1 className="text-[24px] font-extrabold leading-tight tracking-tight">{type.name}</h1>
        <p className="mt-1 text-[14px] text-[var(--los-muted)]">{type.durationMin} minutes{host?.name ? ` with ${host.name}` : ""}{type.description ? ` · ${type.description}` : ""}</p>
        <BookingClient typeId={type.id} tz={tz} month={month} day={day} weekdays={[...weekdays]} slots={slots.map((s) => ({ startAt: s.startAt.toISOString(), label: s.label }))} questions={JSON.parse(type.questions) as Question[]} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} live={type.status === "active"} />
      </div>
    </div>
  );
}
