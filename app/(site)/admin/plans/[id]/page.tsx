import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { parsePlanProgram } from "@/lib/customPresets";
import PlanEditor from "../PlanEditor";

export const metadata = { title: "Edit Custom Plan", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan = await db.customPlan.findUnique({ where: { id } });
  if (!plan) notFound();
  return (
    <PlanEditor
      initial={{
        id: plan.id,
        customerName: plan.customerName,
        email: plan.email ?? "",
        market: plan.market as "in" | "us",
        expiresAt: plan.expiresAt ? plan.expiresAt.toISOString().slice(0, 10) : "",
        program: parsePlanProgram(plan.json),
      }}
    />
  );
}
