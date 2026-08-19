export default function StatusPill({ status }: { status: string }) {
  const tone: Record<string, string> = {
    approved: "bg-emerald-500/15 text-emerald-300",
    rejected: "bg-red-500/15 text-red-300",
    waiting_on_applicant: "bg-amber-500/15 text-amber-300",
    low_priority: "bg-white/5 text-[var(--color-faint)]",
  };
  return (
    <span className={`rounded px-2 py-1 text-[12px] ${tone[status] ?? "bg-[#7C3AED]/15 text-[var(--color-brand-soft)]"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
