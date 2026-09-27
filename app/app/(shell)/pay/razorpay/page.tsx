import { notFound } from "next/navigation";
import { db } from "@/lib/audit/db";
import { requireOrgPage } from "@/lib/os/guard";
import { formatMinor } from "@/lib/os/commercial";
import { razorpayConfigured, razorpayKeyId } from "@/lib/os/razorpay";
import { Card } from "@/components/leados/ui";
import { PageHeader } from "@/components/os/bits";
import RazorpayCheckout from "./RazorpayCheckout";

export const metadata = { title: "Pay" };

// WP-17 · the only page that loads Razorpay's hosted checkout script. Amount and order come from our records.
export default async function RazorpayPayPage({ searchParams }: { searchParams: Promise<{ order?: string; record?: string; credits?: string }> }) {
  const actor = await requireOrgPage("org.billing");
  const sp = await searchParams;
  if (!razorpayConfigured() || !sp.order) notFound();
  const record = sp.record ? await db.cosCommercialRecord.findFirst({ where: { id: sp.record, orgId: actor.orgId } }) : null;
  const credit = sp.credits ? await db.cosCreditOrder.findFirst({ where: { id: sp.credits, orgId: actor.orgId, providerSessionId: sp.order } }) : null;
  if (!record && !credit) notFound();
  const amountMinor = record ? Number(record.amountMinor - record.paidMinor) : credit!.amountMinor;
  const currency = record ? record.currency : credit!.currency;
  const description = record ? record.description : `${credit!.credits} AI credits`;
  const back = record ? `/app/engagement/${record.engagementId}` : `/app/settings/ai-credits?order=${credit!.id}`;
  return (
    <div className="max-w-[520px]">
      <PageHeader title="Pay" sub="Secure checkout by Razorpay. Cards, UPI and net banking." />
      <Card className="p-5 text-[14px]">
        <div className="font-semibold">{description}</div>
        <div className="mt-1 text-[22px] font-extrabold">{formatMinor(amountMinor, currency)}</div>
        <RazorpayCheckout keyId={razorpayKeyId()} orderId={sp.order} amountMinor={amountMinor} currency={currency} description={description} email={actor.email} backHref={back} />
      </Card>
    </div>
  );
}
