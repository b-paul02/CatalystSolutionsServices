"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db, logEvent } from "@/lib/audit/db";
import { verifySession, SESSION_COOKIE } from "@/lib/audit/adminAuth";

const SALES_STATUSES = ["cold", "hot", "in_pipeline", "converted", "rejected"];

export async function setSalesStatus(formData: FormData) {
  const admin = await verifySession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!admin) throw new Error("Not signed in.");
  const leadId = String(formData.get("leadId") ?? "");
  const salesStatus = String(formData.get("salesStatus") ?? "");
  if (!SALES_STATUSES.includes(salesStatus)) throw new Error("Invalid status.");
  await db.lead.update({ where: { id: leadId }, data: { salesStatus } });
  await logEvent(leadId, "sales_status_changed", { to: salesStatus, by: admin });
  revalidatePath("/admin/leads");
}
