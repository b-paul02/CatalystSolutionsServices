import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { db, logEvent } from "@/lib/audit/db";
import { scrapeSite } from "@/lib/audit/scrape";
import { scoreDoctor } from "@/lib/audit/doctor-questionnaire";
import { runDoctorPipeline } from "@/lib/audit/doctor-pipeline";

export const maxDuration = 300;

// ponytail: in-memory per-IP rate limit — same tradeoff as the business scrape route.
const hits = new Map<string, number[]>();
function limited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  if (limited(ip)) return NextResponse.json({ error: "Too many requests. Try again in an hour." }, { status: 429 });

  const { answers } = await req.json().catch(() => ({}));
  const email = String(answers?.email ?? "");
  if (!answers || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (!String(answers.name ?? "").trim()) {
    return NextResponse.json({ error: "The doctor's name is required." }, { status: 400 });
  }

  // real technical scan when a URL was provided — findings become evidence, not guesses
  const url = String(answers.websiteUrl ?? "").trim();
  const scraped = url
    ? await scrapeSite(url).catch(() => ({ ok: false, url, pages: [], signals: {}, checkedAt: new Date().toISOString().slice(0, 10) }))
    : { ok: false, url: "", noWebsite: true, pages: [], signals: {}, checkedAt: new Date().toISOString().slice(0, 10) };

  const g1 = scoreDoctor(answers);
  const lead = await db.lead.create({
    data: {
      type: "doctor",
      email,
      url: scraped.ok ? scraped.url : url,
      g1Score: g1.score,
      tag: g1.tag,
      evidencePack: { create: { scraped: JSON.stringify(scraped), intake: JSON.stringify(answers) } },
    },
  });
  const placeholder = await db.report.create({ data: { leadId: lead.id, json: "{}", status: "generating" } });
  await logEvent(lead.id, "doctor_intake_submitted", { score: g1.score, tag: g1.tag, scanned: scraped.ok });

  after(async () => {
    try {
      await runDoctorPipeline(lead.id);
    } catch (e) {
      console.error("doctor pipeline failed", e);
      await db.lead.update({ where: { id: lead.id }, data: { status: "needs_attention" } }).catch(() => {});
      await logEvent(lead.id, "pipeline_error", { message: (e as Error).message }).catch(() => {});
    }
  });

  return NextResponse.json({ ok: true, token: placeholder.token });
}
