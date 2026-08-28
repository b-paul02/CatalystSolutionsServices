"use client";

import { useActionState, useState } from "react";
import { createLeadManual } from "../actions";
import type { FormState } from "../../../(auth)/actions";
import { Card, FormNotice, Input, Label, Select, SubmitButton } from "@/components/leados/ui";

const PURPOSES = ["sales_contact", "service_updates", "marketing"];
const CHANNELS = ["call", "whatsapp", "sms", "email"];

export default function NewLeadForm() {
  const [state, action] = useActionState<FormState, FormData>(createLeadManual, {});
  const [leadType, setLeadType] = useState<"b2c" | "b2b">("b2c");
  return (
    <Card className="p-6">
      <form action={action} className="space-y-4">
        <FormNotice state={state} />
        <div>
          <Label htmlFor="leadType">Lead type</Label>
          <Select id="leadType" name="leadType" value={leadType} onChange={(e) => setLeadType(e.target.value as "b2c" | "b2b")}>
            <option value="b2c">B2C — consumer</option>
            <option value="b2b">B2B — business contact</option>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div><Label htmlFor="firstName">First name</Label><Input id="firstName" name="firstName" /></div>
          <div><Label htmlFor="lastName">Last name</Label><Input id="lastName" name="lastName" /></div>
          <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" /></div>
          <div><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" placeholder="+91…" /></div>
          <div><Label htmlFor="city">City</Label><Input id="city" name="city" /></div>
          <div><Label htmlFor="country">Country</Label><Input id="country" name="country" /></div>
        </div>

        {leadType === "b2b" ? (
          <div className="grid grid-cols-2 gap-4">
            <div><Label htmlFor="companyName">Company</Label><Input id="companyName" name="companyName" /></div>
            <div><Label htmlFor="companyDomain">Company website</Label><Input id="companyDomain" name="companyDomain" placeholder="example.com" /></div>
            <div><Label htmlFor="jobTitle">Job title</Label><Input id="jobTitle" name="jobTitle" /></div>
            <div><Label htmlFor="department">Department</Label><Input id="department" name="department" /></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div><Label htmlFor="productInterest">Product / service interest</Label><Input id="productInterest" name="productInterest" /></div>
              <div><Label htmlFor="budgetBand">Budget band</Label><Input id="budgetBand" name="budgetBand" /></div>
            </div>
            <div className="space-y-3 rounded-lg bg-[var(--los-surface-2)] p-3">
              <div className="text-[13px] font-semibold">Lawful use (required for B2C)</div>
              <div>
                <Label>Permitted purposes</Label>
                <div className="flex flex-wrap gap-3 text-[13px]">
                  {PURPOSES.map((p) => (
                    <label key={p} className="flex items-center gap-1.5">
                      <input type="checkbox" value={p} onChange={(e) => {
                        const el = document.getElementById("luPurposes") as HTMLInputElement;
                        const set = new Set(el.value.split(",").filter(Boolean));
                        if (e.target.checked) set.add(p); else set.delete(p);
                        el.value = [...set].join(",");
                      }} /> {p.replace(/_/g, " ")}
                    </label>
                  ))}
                </div>
                <input type="hidden" id="luPurposes" name="luPurposes" defaultValue="" />
              </div>
              <div>
                <Label>Permitted channels</Label>
                <div className="flex flex-wrap gap-3 text-[13px]">
                  {CHANNELS.map((c) => (
                    <label key={c} className="flex items-center gap-1.5">
                      <input type="checkbox" value={c} onChange={(e) => {
                        const el = document.getElementById("luChannels") as HTMLInputElement;
                        const set = new Set(el.value.split(",").filter(Boolean));
                        if (e.target.checked) set.add(c); else set.delete(c);
                        el.value = [...set].join(",");
                      }} /> {c}
                    </label>
                  ))}
                </div>
                <input type="hidden" id="luChannels" name="luChannels" defaultValue="" />
              </div>
              <div>
                <Label htmlFor="luEvidence">How was this contact lawfully obtained?</Label>
                <Input id="luEvidence" name="luEvidence" placeholder="e.g. inbound inquiry on our website, 2026-08-12" />
              </div>
            </div>
          </>
        )}

        <div><Label htmlFor="tags">Tags (comma separated)</Label><Input id="tags" name="tags" placeholder="priority, mumbai" /></div>
        <SubmitButton>Create lead</SubmitButton>
      </form>
    </Card>
  );
}
