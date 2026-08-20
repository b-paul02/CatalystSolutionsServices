// Partner emails are written here but NEVER sent. The admin copies the text and
// sends it from their own mailbox, so partner onboarding stays a human contact
// rather than an automated one. Nothing in this module talks to an email
// provider — the applicant's status link is shown on screen at submit time so
// it is never dependent on an email arriving.

export const SITE = process.env.SITE_URL ?? "http://localhost:3000";

/** A message for the admin to copy and send by hand. Plain text — pastes cleanly. */
export type OutboundMessage = {
  to: string;
  subject: string;
  body: string;
  /** Shown once, never stored: we keep only a hash of the password. */
  credentials?: { email: string; password: string; loginUrl: string };
};

export function partnerWelcomeMessage(opts: {
  to: string; name: string; password: string; rateBp: number; markets: string[];
}): OutboundMessage {
  const loginUrl = `${SITE}/partner/login`;
  const rate = opts.rateBp / 100;
  const markets = opts.markets.map((m) => (m === "IN" ? "India" : "United States")).join(" and ");
  return {
    to: opts.to,
    subject: "Welcome to the Catalyst partner network",
    credentials: { email: opts.to, password: opts.password, loginUrl },
    body: `Hi ${opts.name},

Good news — your application to join the Catalyst partner network has been approved. Welcome aboard.

Here are your sign-in details for the partner portal:

  Portal:   ${loginUrl}
  Email:    ${opts.to}
  Password: ${opts.password}

Please sign in and change that password when you get a moment.

A few things worth knowing before you start:

  • Your commission is ${rate}% of the onboarding fee on every deal you close.
  • You are set up to sell in ${markets || "your agreed market"}.
  • Register an account in the portal before you work it — that protects the deal for you for 90 days.
  • The monthly Growth Plan is not commissionable. Catalyst handles that conversation directly.

Any questions, just reply to this email.

Best regards,
Catalyst Solutions Services`,
  };
}

export function applicationRejectedMessage(opts: { to: string; name: string }): OutboundMessage {
  return {
    to: opts.to,
    subject: "Your Catalyst partner application",
    // Short, gracious, and never carries the internal reason code.
    body: `Hi ${opts.name},

Thank you for your interest in partnering with Catalyst, and for the time you put into your application.

We are not taking things further at the moment. This is not a judgement on your work — we keep the partner group small and deliberately matched to what we are selling this year.

We are grateful you thought of us, and you are welcome to apply again in future.

Best regards,
Catalyst Solutions Services`,
  };
}

export function infoRequestMessage(opts: {
  to: string; name: string; token: string; message: string;
}): OutboundMessage {
  return {
    to: opts.to,
    subject: "A quick question about your partner application",
    body: `Hi ${opts.name},

Thanks for your application to the Catalyst partner network. Before we can take it further, we need a little more from you:

${opts.message}

You can update your application here:

  ${SITE}/partners/apply/edit/${opts.token}

That link opens just the parts we have asked about. Everything else stays as you submitted it.

Best regards,
Catalyst Solutions Services`,
  };
}

/** One line the admin can paste into the To/Subject fields, then the body below. */
export function messageAsText(m: OutboundMessage): string {
  return `To: ${m.to}\nSubject: ${m.subject}\n\n${m.body}`;
}

export function applicationReceivedMessage(opts: {
  to: string; name: string; token: string;
}): OutboundMessage {
  return {
    to: opts.to,
    subject: "We have your partner application",
    body: `Hi ${opts.name},

Thanks for applying to become a Catalyst sales partner. Your application is in, and our partnerships team reviews every one by hand — usually within five working days.

You can check where things stand at any time:

  ${SITE}/partners/apply/status/${opts.token}

That link is personal to you and stays live for 90 days.

Best regards,
Catalyst Solutions Services`,
  };
}
