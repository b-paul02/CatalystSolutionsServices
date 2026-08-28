import { db } from "@/lib/audit/db";
import { sha256 } from "@/lib/leados/crypto";
import { currentLosActor } from "@/lib/leados/auth";
import { Card } from "@/components/leados/ui";
import InviteForm from "./InviteForm";

export const metadata = { title: "Join organization" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await db.losInvitation.findUnique({
    where: { tokenHash: sha256(token) },
    include: { org: true },
  });
  const valid = invite && !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > new Date();
  if (!valid) {
    return (
      <Card className="p-6 text-center">
        <h1 className="mb-2 text-[18px] font-bold">Invitation invalid</h1>
        <p className="text-[14px] text-[var(--los-muted)]">This invitation link is invalid, revoked, or expired. Ask your admin to send a new one.</p>
      </Card>
    );
  }
  const actor = await currentLosActor();
  return (
    <InviteForm
      token={token}
      orgName={invite.org.name}
      email={invite.email}
      role={invite.role}
      signedInEmail={actor?.email ?? null}
    />
  );
}
