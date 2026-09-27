"use server";

import { redirect } from "next/navigation";
import { cancelBooking } from "@/lib/os/booking";
import { WorkError } from "@/lib/os/work";

export async function cancelFromLink(form: FormData) {
  const typeId = String(form.get("typeId") ?? ""), token = String(form.get("token") ?? "");
  try { await cancelBooking(typeId, token, "visitor"); } catch (e) { if (!(e instanceof WorkError)) throw e; }
  redirect(`/app/b/${typeId}/manage/${token}?cancelled=1`);
}
