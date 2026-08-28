import { verifyPrivacyRequest } from "../../actions";
import { Card } from "@/components/leados/ui";

export const metadata = { title: "Privacy request confirmed" };

export default async function PrivacyVerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ok = await verifyPrivacyRequest(token);
  return (
    <div className="flex min-h-dvh items-center justify-center px-5">
      <Card className="max-w-[440px] p-6 text-center">
        {ok ? (
          <>
            <h1 className="mb-2 text-[18px] font-bold">Identity confirmed</h1>
            <p className="text-[14px] text-[var(--los-muted)]">
              Your privacy request is now in progress. We&apos;ll respond to the same contact point within 30 days of your original request.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-[18px] font-bold">Link invalid</h1>
            <p className="text-[14px] text-[var(--los-muted)]">This confirmation link is invalid or was already used.</p>
          </>
        )}
      </Card>
    </div>
  );
}
