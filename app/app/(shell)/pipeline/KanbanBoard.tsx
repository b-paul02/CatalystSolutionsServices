"use client";

// Pipedrive-style kanban: drag between stage columns, totals per column,
// rotting-lead cue (stale > 7 days), converted prompts for a value.
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLeadStatus } from "../leads/actions";
import { Badge } from "@/components/leados/ui";

type Lead = {
  id: string; name: string; status: string; intentScore: number | null;
  conversionValue: number | null; owner: string | null; interest: string | null; staleDays: number;
};
type Stage = { key: string; label: string; isWon: boolean; isLost: boolean };

export default function KanbanBoard(props: { stages: Stage[]; leads: Lead[]; canEdit: boolean; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const move = (leadId: string, stage: Stage) => {
    let lostReason: string | undefined;
    let value: number | undefined;
    if (stage.isLost) lostReason = prompt("Lost reason?") ?? undefined;
    if (stage.isWon) {
      const raw = prompt("Conversion value (optional)?");
      value = raw ? parseFloat(raw) : undefined;
    }
    start(async () => {
      await setLeadStatus(leadId, stage.key, lostReason, value);
      router.refresh();
    });
  };

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {props.stages.map((stage) => {
        const leads = props.leads.filter((l) => l.status === stage.key);
        const total = leads.reduce((s, l) => s + (l.conversionValue ?? 0), 0);
        return (
          <div
            key={stage.key}
            className={`w-[240px] shrink-0 rounded-xl border ${over === stage.key ? "border-[var(--los-brand)]" : "border-[var(--los-line)]"} bg-[var(--los-surface-2)]`}
            onDragOver={(e) => {
              if (props.canEdit) {
                e.preventDefault();
                setOver(stage.key);
              }
            }}
            onDragLeave={() => setOver(null)}
            onDrop={() => {
              setOver(null);
              if (dragId && props.canEdit) move(dragId, stage);
            }}
          >
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="text-[13px] font-bold">{stage.label}</span>
              <span className="text-[12px] text-[var(--los-faint)]">
                {leads.length}{total > 0 ? ` · ${props.currency}${total.toLocaleString()}` : ""}
              </span>
            </div>
            <div className="min-h-[120px] space-y-2 px-2 pb-2">
              {leads.map((l) => (
                <div
                  key={l.id}
                  draggable={props.canEdit && !pending}
                  onDragStart={() => setDragId(l.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`rounded-lg border border-[var(--los-line)] bg-[var(--los-surface)] p-2.5 ${props.canEdit ? "cursor-grab" : ""} ${dragId === l.id ? "opacity-50" : ""}`}
                >
                  <Link href={`/app/leads/${l.id}`} className="block text-[13px] font-semibold text-[var(--los-fg)] hover:text-[var(--los-brand)]">
                    {l.name}
                  </Link>
                  {l.interest && <div className="truncate text-[12px] text-[var(--los-muted)]">{l.interest}</div>}
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {l.intentScore !== null && (
                      <Badge tone={l.intentScore >= 70 ? "danger" : l.intentScore >= 40 ? "warn" : "neutral"}>
                        {l.intentScore >= 70 ? "hot" : l.intentScore >= 40 ? "warm" : "cold"}
                      </Badge>
                    )}
                    {l.owner && <span className="text-[11.5px] text-[var(--los-faint)]">{l.owner}</span>}
                    {!stage.isWon && !stage.isLost && l.staleDays >= 7 && (
                      <span title={`No activity for ${l.staleDays} days`} className="text-[11.5px] text-[var(--los-danger)]">
                        ⏳{l.staleDays}d
                      </span>
                    )}
                    {l.conversionValue !== null && stage.isWon && (
                      <span className="text-[11.5px] font-semibold text-[var(--los-success)]">
                        {props.currency}{l.conversionValue.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
