// Resend REST, same shape as lib/audit/email.ts. Kept separate because that
// module logs every send against a Lead id, and partner applications have no Lead.
const FROM = process.env.EMAIL_FROM ?? "Catalyst Solutions Services <reports@catalystsolutionservices.com>";
export const SITE = process.env.SITE_URL ?? "http://localhost:3000";

async function send(to: string, subject: string, body: string) {
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">${body}
    <p style="margin-top:32px;font-size:13px;color:#777">Catalyst Solutions Services · catalystsolutionservices.com</p></div>`;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email skipped — no RESEND_API_KEY] to=${to} subject="${subject}"`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

export const sendApplicationReceived = (to: string, name: string, token: string) =>
  send(to, "We have your partner application", `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thanks for applying to become a Catalyst sales partner. Your application is in — our partnerships team reviews every one by hand, usually within five working days.</p>
    <p>You can check where things stand at any time:</p>
    <p><a href="${SITE}/partners/apply/status/${token}" style="color:#7C3AED;font-weight:bold">Check your application status</a></p>
    <p>This link is personal to you and stays live for 90 days.</p>`);

// Rejection email: short, gracious, and never carries the internal reason code.
export const sendApplicationRejected = (to: string, name: string) =>
  send(to, "Your Catalyst partner application", `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thank you for your interest in partnering with Catalyst, and for the time you put into your application.</p>
    <p>We are not taking things further at the moment. This is not a judgement on your work — we keep the partner group small and deliberately matched to what we are selling this year.</p>
    <p>We are grateful you thought of us, and you are welcome to apply again in future.</p>`);

export const sendPartnerWelcome = (to: string, name: string, password: string) =>
  send(to, "Welcome to the Catalyst partner network", `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your application has been approved — welcome aboard.</p>
    <p>Your partner dashboard is here:</p>
    <p><a href="${SITE}/partner/login" style="color:#7C3AED;font-weight:bold">Sign in to the partner portal</a></p>
    <p>Sign in with <strong>${escapeHtml(to)}</strong> and this one-off password:</p>
    <p style="font-family:monospace;font-size:17px;background:#f4f2fa;padding:12px 16px;border-radius:8px">${escapeHtml(password)}</p>
    <p>Please change it once you are in. Your commission rate and the markets you can sell in are shown on your earnings page.</p>`);

export const sendInfoRequest = (to: string, name: string, token: string, message: string) =>
  send(to, "A quick question about your partner application", `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Thanks for your application — we need a little more from you before we can take it further.</p>
    <p style="border-left:3px solid #7C3AED;padding-left:14px;color:#333">${escapeHtml(message)}</p>
    <p><a href="${SITE}/partners/apply/edit/${token}" style="color:#7C3AED;font-weight:bold">Update your application</a></p>
    <p>The link opens just the parts we have asked about.</p>`);

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}
