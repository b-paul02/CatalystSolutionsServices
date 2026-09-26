// WP-16 · reschedule / cancel from the confirmation email (signed token). Cancel is a POST form; reschedule reuses the grid.
import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { bookingByToken, slotsForDay, type Question } from "@/lib/os/booking";
import { formatInZone, validTimeZone } from "@/lib/os/time";
import BookingClient from "../../BookingClient";
import { cancelFromLink } from "./actions";

export const metadata = { title: "Your booking", robots: { index: false } };

export default async function ManageBookingPage({ params, searchParams }: { params: Promise<{ typeId: string; token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { typeId, token } = await params;
  const sp = await searchParams;
  const b = await bookingByToken(typeId, token);
  if (!b) notFound();
  const type = await db.cosBookingType.findUniqueOrThrow({ where: { id: typeId } });
  const tz = sp.tz && validTimeZone(sp.tz) ? sp.tz : b.visitorTz ?? type.timezone;
  const day = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  const slots = sp.reschedule && day ? await slotsForDay(type, day, tz) : [];
  const weekdays = [...new Set((await db.cosAvailability.findMany({ where: { orgId: type.orgId, userId: type.hostId }, select: { weekday: true } })).map((a) => a.weekday))];
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-8" style={{ background: "var(--los-bg)" }}>
      <div className="w-full max-w-[720px] rounded-2xl border border-[var(--los-line)] bg-[var(--los-surface)] p-6 sm:p-8">
        <h1 className="text-[22px] font-extrabold">{type.name}</h1>
        {b.status === "cancelled" ? <p className="mt-2 text-[14px]">This booking was cancelled.{sp.cancelled ? "" : " Book a new time from the original page."}</p> : (
          <>
            <p className="mt-1 text-[14px] text-[var(--los-muted)]">Booked for <b>{formatInZone(b.startAt, tz)}</b> ({tz}).</p>
            {!sp.reschedule && (
              <div className="mt-4 flex flex-wrap gap-2">
                <a href={`?reschedule=1`} className="rounded-lg bg-[var(--los-brand)] px-4 py-2 text-[14px] font-semibold text-white">Reschedule</a>
                <form action={cancelFromLink}><input type="hidden" name="typeId" value={typeId} /><input type="hidden" name="token" value={token} /><button className="rounded-lg border border-[var(--los-danger)] px-4 py-2 text-[14px] font-semibold text-[var(--los-danger)]">Cancel booking</button></form>
              </div>
            )}
            {sp.reschedule && <BookingClient typeId={type.id} tz={tz} month={sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : new Date().toISOString().slice(0, 7)} day={day} weekdays={weekdays} slots={slots.map((s) => ({ startAt: s.startAt.toISOString(), label: s.label }))} questions={[] as Question[]} turnstileSiteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null} live manageToken={token} />}
          </>
        )}
      </div>
    </div>
  );
}
