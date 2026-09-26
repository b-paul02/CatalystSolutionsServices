// "Growth step" panel: the last thing on every finished flow. Names the pillar it advanced, the metric that will show
// it on Results, and ONE real button that creates or advances a goal / work item in that pillar. It never predicts an
// outcome — it says what will be measured.
import { Card } from "@/components/leados/ui";
import ActionForm from "@/components/os/ActionForm";
import { PILLAR_LABEL, type GrowthStep as Step } from "@/lib/os/pillars";
import { advancePillarAction } from "@/app/app/(shell)/_os/growth";

export default function GrowthStep({ step, done, note }: { step: Step; done?: string; note?: string }) {
  return (
    <Card className="border-[var(--los-brand)] p-4 text-[13.5px]" >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[var(--los-brand)]">Growth step · {PILLAR_LABEL[step.pillar]}</div>
          {done && <div className="mt-0.5 font-semibold">{done}</div>}
          <div className="mt-0.5 text-[var(--los-muted)]">Measured on Results as <b className="text-[var(--los-fg)]">{step.metricLabel}</b>{note ? ` · ${note}` : ""}.</div>
        </div>
        <ActionForm action={advancePillarAction} submit={step.action.label} hidden={{ step: JSON.stringify(step) }} />
      </div>
    </Card>
  );
}
