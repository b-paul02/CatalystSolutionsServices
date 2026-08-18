import type { Metadata } from "next";
import { db } from "@/lib/audit/db";
import { parsePlanProgram, planExpired } from "@/lib/customPresets";
import BookingForm, { type CustomPlanProps } from "./BookingForm";

export const metadata: Metadata = { title: "Book Your Program" };

// searchParams read server-side and passed as props — keeps the client bundle
// free of useSearchParams/Suspense streaming. ponytail: fewer moving parts.
// ?plan=<token> books from a customer-specific plan instead of a catalogue slug.
export default async function BookPage({ searchParams }: { searchParams: Promise<{ slug?: string; tier?: string; plan?: string; canceled?: string }> }) {
  const q = await searchParams;
  let custom: CustomPlanProps | null = null;
  if (q.plan) {
    const plan = await db.customPlan.findUnique({ where: { token: q.plan } });
    const program = plan && !planExpired(plan) ? parsePlanProgram(plan.json) : null;
    if (plan && program) custom = { token: plan.token, market: plan.market as "in" | "us", program };
  }
  return <BookingForm slug={q.slug ?? ""} tierIndex={Number(q.tier ?? "-1")} canceled={q.canceled === "1"} custom={custom} />;
}
