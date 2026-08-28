import { handleOptOut } from "@/lib/leados/outreach";
import { Card } from "@/components/leados/ui";

export const metadata = { title: "Unsubscribed", robots: { index: false } };

export default async function OptOutPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await handleOptOut(token);
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <Card className="max-w-[420px] p-6 text-center">
        {ok ? (
          <>
            <h1 className="mb-2 text-[18px] font-bold">You&apos;re unsubscribed</h1>
            <p className="text-[14px] text-[var(--los-muted)]">
              You won&apos;t receive messages on this channel anymore.
              To remove your data entirely, use the <a href="/app/privacy" className="text-[var(--los-brand)] underline">privacy page</a>.
            </p>
          </>
        ) : (
          <h1 className="text-[16px] font-bold">This link is invalid or already used.</h1>
        )}
      </Card>
    </div>
  );
}
