import type { Metadata } from "next";
import PageHero from "@/components/PageHero";
import ApplyForm from "./ApplyForm";

export const metadata: Metadata = {
  title: "Partner application",
  description: "Apply to become a Catalyst sales partner.",
  robots: { index: false },
};

export default function ApplyPage() {
  return (
    <>
      <PageHero
        badge="Partner application"
        title="Tell us about your sales work"
        subtitle="Five short steps, about ten minutes. Your progress is saved as you go, and we read every application by hand."
      />
      <section className="px-5 pb-20 sm:px-8">
        <div className="mx-auto max-w-[760px]">
          <ApplyForm />
        </div>
      </section>
    </>
  );
}
