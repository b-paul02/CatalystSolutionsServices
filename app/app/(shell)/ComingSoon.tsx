import { Card } from "@/components/leados/ui";

// Placeholder for nav targets whose phase hasn't shipped yet.
export default function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div>
      <h1 className="mb-4 text-[22px] font-extrabold tracking-tight">{title}</h1>
      <Card className="p-8 text-center">
        <p className="text-[14px] text-[var(--los-muted)]">{note}</p>
      </Card>
    </div>
  );
}
