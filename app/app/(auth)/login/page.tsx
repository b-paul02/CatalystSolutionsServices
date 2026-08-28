import Link from "next/link";
import { redirect } from "next/navigation";
import { currentLosActor } from "@/lib/leados/auth";
import { oauthEnabled } from "@/lib/leados/oauth";
import LoginForm from "./LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  const actor = await currentLosActor();
  if (actor) redirect(actor.mfaPending ? "/app/mfa" : "/app/dashboard");
  const providers = (["google", "microsoft"] as const).filter(oauthEnabled);
  return (
    <>
      <LoginForm />
      {providers.length > 0 && (
        <div className="mt-3 space-y-2">
          {providers.map((p) => (
            <a
              key={p}
              href={`/api/leados/oauth/${p}/start`}
              className="flex items-center justify-center gap-2 rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] px-4 py-2 text-[14px] font-medium hover:bg-[var(--los-surface-2)]"
            >
              Continue with {p === "google" ? "Google" : "Microsoft"}
            </a>
          ))}
        </div>
      )}
      <p className="mt-4 text-center text-[13.5px] text-[var(--los-muted)]">
        New to LeadOS?{" "}
        <Link href="/app/register" className="font-medium text-[var(--los-brand)]">Create an account</Link>
      </p>
    </>
  );
}
