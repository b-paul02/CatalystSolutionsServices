import PrivacyRequestForm from "./PrivacyRequestForm";

export const metadata = { title: "Privacy request" };

// Public page — no sign-in required.
export default function PrivacyRequestPage() {
  return (
    <div className="flex min-h-dvh items-start justify-center px-5 py-14">
      <div className="w-full max-w-[520px]">
        <div className="mb-6">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--los-muted)]">LeadOS · Catalyst Solutions</div>
          <h1 className="text-[24px] font-extrabold tracking-tight">Privacy request</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--los-muted)]">
            Ask what data we hold about you, correct it, object to its use, or have it deleted.
            We verify your identity before acting and respond within 30 days.
          </p>
        </div>
        <PrivacyRequestForm />
      </div>
    </div>
  );
}
