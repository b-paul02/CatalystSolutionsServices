"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { verifySession, SESSION_COOKIE } from "@/lib/audit/adminAuth";
import { parsePlanProgram } from "@/lib/customPresets";

const STATUSES = ["draft", "sent", "accepted", "expired"];

async function requireAdmin() {
  const admin = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!admin) throw new Error("Not signed in.");
  return admin;
}

export async function savePlan(payload: {
  id?: string;
  customerName: string;
  email: string;
  market: "in" | "us";
  expiresAt: string; // "" or yyyy-mm-dd
  json: string; // Program JSON assembled by the editor
}) {
  await requireAdmin();
  const { id, customerName, email, market, expiresAt, json } = payload;
  if (!customerName.trim()) throw new Error("Customer name is required.");
  if (market !== "in" && market !== "us") throw new Error("Invalid market.");
  const program = parsePlanProgram(json);
  if (!program || program.tiers.length === 0) throw new Error("The plan needs a name and at least one tier.");
  const data = {
    customerName: customerName.trim(),
    email: email.trim() || null,
    market,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    json,
  };
  if (id) await db.customPlan.update({ where: { id }, data });
  else await db.customPlan.create({ data });
  revalidatePath("/admin/plans");
  redirect("/admin/plans");
}

export async function setPlanStatus(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status)) throw new Error("Invalid status.");
  await db.customPlan.update({ where: { id }, data: { status } });
  revalidatePath("/admin/plans");
}

export async function deletePlan(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  await db.customPlan.delete({ where: { id } });
  revalidatePath("/admin/plans");
}
