import { redirect } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireLosUser } from "@/lib/leados/auth";
import { LosAuthError } from "@/lib/leados/auth";
import OnboardingForm from "./OnboardingForm";

export const metadata = { title: "Set up your organization" };

export default async function OnboardingPage() {
  let userId: string;
  try {
    userId = (await requireLosUser()).userId;
  } catch (e) {
    if (e instanceof LosAuthError) redirect("/app/login");
    throw e;
  }
  const membership = await db.losMembership.findFirst({ where: { userId } });
  if (membership) redirect("/app/dashboard");
  return (
    <div className="flex min-h-dvh items-start justify-center px-5 py-14">
      <div className="w-full max-w-[520px]">
        <div className="mb-6">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--los-muted)]">LeadOS</div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Set up your organization</h1>
        </div>
        <OnboardingForm />
      </div>
    </div>
  );
}
