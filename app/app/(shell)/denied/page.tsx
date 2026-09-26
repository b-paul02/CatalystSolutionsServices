import Link from "next/link";
import { Card } from "@/components/leados/ui";

export const metadata = { title: "Not available" };

// Where an ordinary refusal lands (lib/os/guard.ts → requireOrgPage). Says nothing about what exists
// behind the refusal, and always offers a next step. Rendered inside the shell, so the workspace
// switcher is right there when the cause is "wrong workspace".
const COPY: Record<string, { title: string; body: string }> = {
  scope: { title: "This area isn't part of this workspace", body: "It isn't included in this workspace's current engagement. If you switched workspaces, the page you were on may only exist in the other one. To add it, raise a request and we'll scope it with you." },
  role: { title: "Your role can't open this", body: "Your access in this workspace doesn't include this area. A workspace owner or admin can change roles in Settings → Team." },
};

export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ why?: string }> }) {
  const c = COPY[(await searchParams).why ?? ""] ?? COPY.role;
  return (
    <div className="max-w-[560px]">
      <Card className="p-6">
        <h1 className="text-[20px] font-bold">{c.title}</h1>
        <p className="mt-2 text-[14px] text-[var(--los-muted)]">{c.body}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/app/dashboard" className="rounded-lg bg-[var(--los-brand)] px-3 py-1.5 text-[13px] font-semibold text-white">Go to Home</Link>
          <Link href="/app/work" className="rounded-lg border border-[var(--los-line)] px-3 py-1.5 text-[13px] font-semibold">Raise a request</Link>
        </div>
      </Card>
    </div>
  );
}
