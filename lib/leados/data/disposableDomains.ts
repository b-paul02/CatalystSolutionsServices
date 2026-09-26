// WP-15 · our own list of throwaway-mailbox domains (no vendor). Extend by hand; keep it lowercase.
export const DISPOSABLE_DOMAINS: ReadonlySet<string> = new Set([
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "33mail.com", "anonbox.net", "byom.de", "dispostable.com", "emailondeck.com",
  "fakeinbox.com", "getairmail.com", "getnada.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamailblock.com",
  "harakirimail.com", "inboxbear.com", "jetable.org", "mail-temp.com", "mailcatch.com", "maildrop.cc", "mailinator.com", "mailnesia.com",
  "mailnull.com", "mailsac.com", "meltmail.com", "mintemail.com", "mohmal.com", "mytemp.email", "nowmymail.com", "sharklasers.com",
  "spam4.me", "spamgourmet.com", "temp-mail.io", "temp-mail.org", "tempail.com", "tempmail.com", "tempmail.net", "tempmailo.com",
  "tempr.email", "throwawaymail.com", "trashmail.com", "trashmail.de", "trashmail.net", "yopmail.com", "yopmail.fr", "zetmail.com",
]);

/** Addresses that reach a function, not a person. Sending sequences to these is risky, not invalid. */
export const ROLE_LOCAL_PARTS: ReadonlySet<string> = new Set([
  "info", "admin", "administrator", "webmaster", "postmaster", "hostmaster", "noreply", "no-reply", "donotreply", "do-not-reply", "support", "sales",
  "contact", "hello", "office", "billing", "accounts", "marketing", "help", "team", "careers", "jobs", "hr", "press", "abuse", "security", "privacy", "legal",
]);
