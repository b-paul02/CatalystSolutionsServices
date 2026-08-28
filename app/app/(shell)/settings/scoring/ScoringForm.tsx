"use client";

import { useActionState } from "react";
import { saveScoringWeights } from "./actions";
import type { FormState } from "../../../(auth)/actions";
import type { ScoringWeights } from "@/lib/leados/scoring";
import { Card, FormNotice, Input, Label, SubmitButton } from "@/components/leados/ui";

const QUALITY_LABELS: Record<keyof ScoringWeights["quality"], string> = {
  hasName: "Has a name", hasEmail: "Has an email", hasPhone: "Has a phone",
  emailVerified: "Email verified", phoneVerified: "Phone verified",
  hasLocation: "Location known", freshWithin7d: "Fresh (under 7 days)",
  sourceForm: "Self-submitted (form)", sourceAllocation: "From verified inventory",
};
const INTENT_LABELS: Record<keyof ScoringWeights["intent"], string> = {
  base: "Base score", qualifyingAnswer: "Per answered profile question",
  hasBudget: "Declared a budget", hasTimeline: "Declared a timeline",
  engagedStatus: "Actively engaged stage", recentActivity7d: "Recent activity",
};

export default function ScoringForm({ weights, canManage }: { weights: ScoringWeights; canManage: boolean }) {
  const [state, action] = useActionState<FormState, FormData>(saveScoringWeights, {});
  return (
    <form action={action} className="space-y-5">
      <FormNotice state={state} />
      <p className="text-[13.5px] text-[var(--los-muted)]">
        Rule-based scoring with your own weights. Predictive scoring unlocks automatically once enough
        converted/lost outcomes exist to learn from.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold">Quality score weights</h2>
          <div className="space-y-2.5">
            {(Object.keys(QUALITY_LABELS) as (keyof ScoringWeights["quality"])[]).map((k) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <Label htmlFor={`q-${k}`}>{QUALITY_LABELS[k]}</Label>
                <Input id={`q-${k}`} name={`quality.${k}`} type="number" min={0} max={50} defaultValue={weights.quality[k]} disabled={!canManage} className="!w-[80px]" />
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 text-[15px] font-bold">Intent score weights</h2>
          <div className="space-y-2.5">
            {(Object.keys(INTENT_LABELS) as (keyof ScoringWeights["intent"])[]).map((k) => (
              <div key={k} className="flex items-center justify-between gap-3">
                <Label htmlFor={`i-${k}`}>{INTENT_LABELS[k]}</Label>
                <Input id={`i-${k}`} name={`intent.${k}`} type="number" min={0} max={50} defaultValue={weights.intent[k]} disabled={!canManage} className="!w-[80px]" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="hot">Hot ≥</Label>
              <Input id="hot" name="hotThreshold" type="number" min={1} max={100} defaultValue={weights.hotThreshold} disabled={!canManage} className="!w-[70px]" />
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="warm">Warm ≥</Label>
              <Input id="warm" name="warmThreshold" type="number" min={1} max={100} defaultValue={weights.warmThreshold} disabled={!canManage} className="!w-[70px]" />
            </div>
          </div>
        </Card>
      </div>
      {canManage && <SubmitButton>Save weights</SubmitButton>}
    </form>
  );
}
