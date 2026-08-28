"use client";

import { useActionState } from "react";
import { createOrg } from "./actions";
import type { FormState } from "../(auth)/actions";
import { Card, FormNotice, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

const INDUSTRIES = [
  "Real estate", "Financial services", "Education", "Healthcare", "Home services",
  "Automotive", "Travel & hospitality", "Software & IT", "E-commerce & retail",
  "Professional services", "Manufacturing", "Other",
];

export default function OnboardingForm() {
  const [state, action] = useActionState<FormState, FormData>(createOrg, {});
  return (
    <Card className="p-6">
      <form action={action} className="space-y-5">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="name">Organization name</Label>
          <Input id="name" name="name" required placeholder="Acme Realty Pvt Ltd" />
        </div>
        <div>
          <Label htmlFor="website">Website (optional)</Label>
          <Input id="website" name="website" type="url" placeholder="https://example.com" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="intendedUse">How will you use LeadOS?</Label>
            <Select id="intendedUse" name="intendedUse" defaultValue="both">
              <option value="b2b">B2B leads</option>
              <option value="b2c">B2C leads</option>
              <option value="both">Both</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="market">Billing market</Label>
            <Select id="market" name="market" defaultValue="IN">
              <option value="IN">India (₹)</option>
              <option value="US">United States ($)</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="industry">Industry</Label>
            <Select id="industry" name="industry" defaultValue="">
              <option value="" disabled>Select…</option>
              {INDUSTRIES.map((i) => <option key={i} value={i}>{i}</option>)}
            </Select>
          </div>
          <div>
            <Label htmlFor="jurisdiction">Country of operation</Label>
            <Input id="jurisdiction" name="jurisdiction" placeholder="India" />
          </div>
        </div>
        <div className="space-y-2 rounded-lg bg-[var(--los-surface-2)] p-3 text-[13px] leading-relaxed">
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptTerms" className="mt-0.5" required />
            <span>I accept the LeadOS terms of service and data processing agreement on behalf of this organization.</span>
          </label>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="acceptProhibited" className="mt-0.5" required />
            <span>
              I confirm this organization will not use leads for discrimination, harassment, political profiling,
              eligibility decisions (employment, housing, credit, insurance), targeting children, or any deceptive purpose.
            </span>
          </label>
        </div>
        <SubmitButton className="w-full">Create organization</SubmitButton>
      </form>
    </Card>
  );
}
