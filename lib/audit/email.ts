// Email via Resend REST API (plain fetch). Without RESEND_API_KEY, emails are logged and skipped — dev mode.
import { logEvent } from "./db";

const FROM = process.env.EMAIL_FROM ?? "Catalyst Solutions Services <reports@catalystsolutionservices.com>";
const SITE = process.env.SITE_URL ?? "http://localhost:3000";

async function send(leadId: string, to: string, subject: string, html: string, type: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${to} subject="${subject}"`);
    await logEvent(leadId, `email_skipped:${type}`, { to, subject });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  await logEvent(leadId, `email_sent:${type}`, { to, subject });
}

const wrap = (body: string) =>
  `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">${body}
  <p style="margin-top:32px;font-size:13px;color:#777">Catalyst Solutions Services · catalystsolutionservices.com</p></div>`;

export const sendReportEmail = (leadId: string, to: string, businessName: string, token: string) =>
  send(leadId, to, `Your Growth Snapshot is ready — ${businessName}`, wrap(
    `<p>Hi,</p>
     <p>Your Growth Snapshot for ${businessName} has been reviewed by our team and is ready.</p>
     <p><a href="${SITE}/growth-audit/report/${token}" style="color:#7C3AED;font-weight:bold">Read your report</a></p>
     <p>It covers what we found on your site, who your best-fit customers look like, and two or three routes you could take — including what you can do yourself. No prices, no pitch.</p>
     <p>If you want to talk any of it through, the report ends with a link to book a free 30-minute session.</p>`), "report");

export const sendDay3Email = (leadId: string, to: string, token: string) =>
  send(leadId, to, "Any questions about your Growth Snapshot?", wrap(
    `<p>Hi,</p>
     <p>A few days ago your Growth Snapshot was approved and published. If you have read it, the quick wins section is the best place to start — each one is doable inside 30 days.</p>
     <p>If anything in it is unclear, or you want a second opinion on which route fits your next quarter, reply to this email or <a href="${SITE}/growth-audit/report/${token}" style="color:#7C3AED">revisit the report</a>.</p>`), "day3");

export const sendDay14Email = (leadId: string, to: string, token: string) =>
  send(leadId, to, "Two weeks on — how is it going?", wrap(
    `<p>Hi,</p>
     <p>Two weeks ago you received your Growth Snapshot. If you started on the quick wins, you are ahead of most businesses we audit.</p>
     <p>If you would like help sequencing the bigger routes, a free 30-minute session is still open to you — no pitch, just the plan. <a href="${SITE}/contact" style="color:#7C3AED">Book a time</a>.</p>
     <p>Your report stays available <a href="${SITE}/growth-audit/report/${token}" style="color:#7C3AED">here</a>.</p>`), "day14");
