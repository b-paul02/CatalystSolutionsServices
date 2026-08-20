import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import { db } from "@/lib/audit/db";
import ApplyForm from "./ApplyForm";
import type { DraftFields } from "./actions";

export const metadata: Metadata = {
  title: "Partner application",
  description: "Apply to become a Catalyst sales partner.",
  robots: { index: false },
};

const list = (v: string | null) => { try { return JSON.parse(v ?? "[]") as string[]; } catch { return []; } };

export default async function ApplyPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  // Started in the hero? Resume that draft on step 1 with those answers already
  // filled, so the rest of "About you" still gets completed. Columns are named
  // explicitly — this page is public, so nothing internal may reach it.
  let initialToken: string | null = null;
  let initialValues: DraftFields | undefined;
  let initialStep = 0;

  if (t) {
    const draft = await db.partnerApplication.findUnique({
      where: { statusToken: t },
      select: {
        fullName: true, email: true, phone: true, country: true, city: true, linkedinUrl: true,
        companyName: true, companyWebsite: true, entityType: true, teamSize: true, hasOwnDelivery: true,
        yearsExperience: true, industries: true, typicalDealSizeBand: true, dealExamples: true,
        prospects90dBand: true, leadSources: true, expectedDealsBand: true, markets: true,
        targetFamilies: true, hoursPerWeek: true, whyCatalyst: true,
        submittedAt: true, deletedAt: true,
      },
    });
    if (draft && !draft.submittedAt && !draft.deletedAt) {
      initialToken = t;
      initialStep = 0; // hero prefills step 1; the applicant finishes it
      initialValues = {
        fullName: draft.fullName ?? "", email: draft.email ?? "", phone: draft.phone ?? "",
        country: draft.country ?? "", city: draft.city ?? "", linkedinUrl: draft.linkedinUrl ?? "",
        companyName: draft.companyName ?? "", companyWebsite: draft.companyWebsite ?? "",
        entityType: draft.entityType ?? "", teamSize: draft.teamSize, hasOwnDelivery: draft.hasOwnDelivery,
        yearsExperience: draft.yearsExperience, industries: list(draft.industries),
        typicalDealSizeBand: draft.typicalDealSizeBand ?? "", dealExamples: draft.dealExamples ?? "",
        prospects90dBand: draft.prospects90dBand ?? "", leadSources: list(draft.leadSources),
        expectedDealsBand: draft.expectedDealsBand ?? "", markets: list(draft.markets),
        targetFamilies: list(draft.targetFamilies), hoursPerWeek: draft.hoursPerWeek,
        whyCatalyst: draft.whyCatalyst ?? "",
      };
    }
  }

  return (
    <>
      <PageHero
        badge="Partner application"
        title={initialToken ? `Thanks${initialValues?.fullName ? `, ${initialValues.fullName.split(" ")[0]}` : ""} — a few more questions` : "Tell us about your sales work"}
        subtitle="Four short steps, about eight minutes. Your progress is saved as you go, and we read every application by hand."
      />
      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-[760px]">
          <ApplyForm initialToken={initialToken} initialValues={initialValues} initialStep={initialStep} />
        </div>
      </section>
    </>
  );
}
