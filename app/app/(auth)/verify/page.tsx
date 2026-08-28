import Link from "next/link";
import { verifyEmailToken } from "../actions";
import { Card } from "@/components/leados/ui";

export const metadata = { title: "Verify email" };

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const result = token ? await verifyEmailToken(token) : { ok: false };
  return (
    <Card className="p-6 text-center">
      {result.ok ? (
        <>
          <h1 className="mb-2 text-[18px] font-bold">Email verified</h1>
          <p className="mb-4 text-[14px] text-[var(--los-muted)]">Your account is ready.</p>
          <Link href="/app/login" className="font-medium text-[var(--los-brand)]">Sign in to continue</Link>
        </>
      ) : (
        <>
          <h1 className="mb-2 text-[18px] font-bold">Link invalid or expired</h1>
          <p className="mb-4 text-[14px] text-[var(--los-muted)]">
            Request a fresh link by signing in — we resend verification automatically.
          </p>
          <Link href="/app/login" className="font-medium text-[var(--los-brand)]">Back to sign in</Link>
        </>
      )}
    </Card>
  );
}
