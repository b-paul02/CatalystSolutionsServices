"use server";

import { revalidatePath } from "next/cache";
import { requireOrgAction } from "@/lib/leados/auth";
import { saveAvailability, saveBookingType, setBookingTypeStatus } from "@/lib/os/booking";
import { WorkError } from "@/lib/os/work";

type State = { error?: string; ok?: string; href?: string };
const PATH = "/app/settings/booking";
const str = (form: FormData, key: string, max = 600) => String(form.get(key) ?? "").trim().slice(0, max);
const fail = (e: unknown): State => { if (e instanceof WorkError || (e instanceof Error && e.name === "LosAuthError")) return { error: e.message }; throw e; };

export async function bookingTypeSave(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  try {
    const questions = str(form, "questions", 2000).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => ({ key: "", label: l.replace(/\s*\*$/, ""), required: /\*$/.test(l) }));
    const t = await saveBookingType(actor, { id: str(form, "id", 60) || undefined, name: str(form, "name", 80), description: str(form, "description"), durationMin: Number(str(form, "durationMin", 4)), bufferMin: Number(str(form, "bufferMin", 4)), timezone: str(form, "timezone", 60), questions });
    revalidatePath(PATH);
    return { ok: str(form, "id", 60) ? "Saved." : "Draft created. Add your availability, preview the page, then activate.", href: `/app/b/${t.id}?preview=1` };
  } catch (e) { return fail(e); }
}

export async function bookingTypeStatus(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  const status = str(form, "status", 10);
  if (status !== "active" && status !== "paused" && status !== "draft") return { error: "Bad status." };
  try { await setBookingTypeStatus(actor, str(form, "id", 60), status); revalidatePath(PATH); return { ok: status === "active" ? "Live. Share the page link." : "Paused — the page refuses new bookings." }; } catch (e) { return fail(e); }
}

export async function availabilitySave(_p: State, form: FormData): Promise<State> {
  const actor = await requireOrgAction(); if ("error" in actor) return actor;
  try {
    const rows = Array.from({ length: 7 }, (_, i) => ({ weekday: i, start: str(form, `start_${i}`, 5), end: str(form, `end_${i}`, 5) })).filter((r) => r.start && r.end);
    const n = await saveAvailability(actor, rows);
    revalidatePath(PATH);
    return { ok: `${n} day(s) of availability saved.` };
  } catch (e) { return fail(e); }
}
