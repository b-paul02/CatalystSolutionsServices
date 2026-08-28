import { describe, expect, it } from "vitest";
import { defaultFormSpec, defaultPageSpec, sanitizeFormSpec, validateCampaign } from "@/lib/leados/campaigns";

const okSpec = defaultFormSpec();
const okPage = defaultPageSpec("Acme");

describe("campaign validation gate", () => {
  it("passes a sane default campaign", () => {
    const problems = validateCampaign({ name: "Test", formSpec: okSpec, pageSpec: okPage, offerText: "" });
    expect(problems.filter((p) => p.severity === "error")).toHaveLength(0);
  });
  it("blocks a form with no required contact point", () => {
    const spec = { ...okSpec, fields: okSpec.fields.map((f) => ({ ...f, required: false })) };
    const problems = validateCampaign({ name: "Test", formSpec: spec, pageSpec: okPage, offerText: "" });
    expect(problems.some((p) => p.severity === "error" && p.message.includes("contact point"))).toBe(true);
  });
  it("blocks missing consent purposes or channels", () => {
    expect(validateCampaign({ name: "T", formSpec: { ...okSpec, consentPurposes: [] }, pageSpec: okPage, offerText: "" })
      .some((p) => p.severity === "error")).toBe(true);
    expect(validateCampaign({ name: "T", formSpec: { ...okSpec, consentChannels: [] }, pageSpec: okPage, offerText: "" })
      .some((p) => p.severity === "error")).toBe(true);
  });
  it("blocks sensitive fields", () => {
    const spec = { ...okSpec, qualifying: [{ key: "aadhaar", label: "Aadhaar number", kind: "text" as const, required: false }] };
    expect(validateCampaign({ name: "T", formSpec: spec, pageSpec: okPage, offerText: "" })
      .some((p) => p.message.includes("sensitive"))).toBe(true);
  });
  it("blocks prohibited claims in copy", () => {
    const page = { ...okPage, headline: "Guaranteed returns on your investment!" };
    expect(validateCampaign({ name: "T", formSpec: okSpec, pageSpec: page, offerText: "" })
      .some((p) => p.severity === "error" && p.message.includes("prohibited claim"))).toBe(true);
  });
});

describe("sanitizeFormSpec", () => {
  it("drops junk and caps sizes, falls back to defaults", () => {
    expect(sanitizeFormSpec(null)).toEqual(defaultFormSpec());
    const dirty = {
      fields: [
        { key: "phone<script>", label: "Phone", kind: "phone", required: true },
        { bogus: true },
      ],
      qualifying: Array.from({ length: 40 }, (_, i) => ({ key: `q${i}`, label: `Q${i}`, kind: "nonsense", required: false })),
      consentPurposes: ["sales_contact"],
      consentChannels: ["call"],
      otpVerify: "yes",
    };
    const clean = sanitizeFormSpec(dirty);
    expect(clean.fields[0].key).toBe("phonescript");
    expect(clean.qualifying).toHaveLength(20);
    expect(clean.qualifying[0].kind).toBe("text");
    expect(clean.otpVerify).toBe(true);
  });
});
