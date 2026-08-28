// LeadOS transactional email. Uses Resend when RESEND_API_KEY is set.
// Without it (local dev), the mail is logged and the action link is returned
// so the UI can show it inline — flows stay fully testable with no provider.

export const APP_URL =
  process.env.LEADOS_APP_URL ??
  (process.env.NODE_ENV === "production" ? "https://app.catalystsolutionservices.com/app" : "http://app.localhost:3000/app");

export type SentMail = { delivered: boolean; devLink?: string };

export async function sendLosMail(opts: {
  to: string;
  subject: string;
  text: string;
  /** The primary action URL — surfaced to the UI in dev mode. */
  link?: string;
}): Promise<SentMail> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[leados mail:dev] to=${opts.to} subject="${opts.subject}"${opts.link ? ` link=${opts.link}` : ""}`);
    return { delivered: false, devLink: opts.link };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "LeadOS <noreply@catalystsolutionservices.com>",
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
    }),
  });
  if (!res.ok) {
    console.error(`[leados mail] send failed ${res.status}: ${await res.text()}`);
    return { delivered: false, devLink: opts.link };
  }
  return { delivered: true };
}
