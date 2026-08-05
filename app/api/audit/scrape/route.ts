import { NextRequest, NextResponse } from "next/server";
import { scrapeSite } from "@/lib/audit/scrape";
import { callClaudeJSON } from "@/lib/audit/anthropic";
import { db, logEvent } from "@/lib/audit/db";

export const maxDuration = 120;

// ponytail: in-memory per-IP rate limit — fine for one server; swap for Upstash if this ever runs multi-instance.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5; // 5 scrapes/hour/IP
}

export type InferredProfile = {
  business_name: string;
  sells: string;
  serves: string;
  industry: string;
  business_model: "B2B" | "B2C" | "Both" | "Unclear";
  maturity_notes: string;
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many requests. Try again in an hour." }, { status: 429 });

  const { url, email, noWebsite, businessName } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  // No-website path: skip scraping entirely; profile is filled manually in the wizard.
  if (noWebsite) {
    if (typeof businessName !== "string" || !businessName.trim()) {
      return NextResponse.json({ error: "Your business name is required." }, { status: 400 });
    }
    const empty = {
      ok: false, noWebsite: true, url: "", pages: [],
      signals: { hasAnalytics: false, hasBlog: false, hasBooking: false, hasEcommerce: false, hasSchema: false, hasMetaDescription: false, https: false, formCount: 0, maxFormFields: 0, homepageWordCount: 0 },
      inferred: null,
    };
    const lead = await db.lead.create({
      data: { email: email.trim(), url: "", evidencePack: { create: { scraped: JSON.stringify(empty) } } },
    });
    await logEvent(lead.id, "scrape_done", { ok: false, noWebsite: true });
    return NextResponse.json({ leadId: lead.id, scraped: { ok: false, noWebsite: true }, inferred: { business_name: businessName.trim() } });
  }

  if (typeof url !== "string" || !url.trim()) {
    return NextResponse.json({ error: "A website URL is required." }, { status: 400 });
  }

  const scraped = await scrapeSite(url.trim());

  let inferred: InferredProfile | null = null;
  if (scraped.ok) {
    try {
      inferred = await callClaudeJSON<InferredProfile>(
        `You infer a business profile from scraped website content for an audit intake. Be conservative: if the pages don't support a guess, say "Unclear". Plain language, no hype.`,
        `SCRAPED PAGES:\n${JSON.stringify(scraped.pages, null, 1)}\nSIGNALS: ${JSON.stringify(scraped.signals)}\n\nReturn JSON: {"business_name","sells" (what they sell, one sentence),"serves" (who they serve, one sentence),"industry","business_model":"B2B|B2C|Both|Unclear","maturity_notes" (one sentence on digital maturity: blog/tracking/booking/ecommerce)}`
      );
    } catch (e) {
      console.error("inference failed", e);
    }
  }

  const lead = await db.lead.create({
    data: {
      email: email.trim(),
      url: scraped.url,
      evidencePack: { create: { scraped: JSON.stringify({ ...scraped, inferred }) } },
    },
  });
  await logEvent(lead.id, "scrape_done", { ok: scraped.ok, pages: scraped.pages.length });

  return NextResponse.json({ leadId: lead.id, scraped: { ok: scraped.ok, error: scraped.error, signals: scraped.signals }, inferred });
}
