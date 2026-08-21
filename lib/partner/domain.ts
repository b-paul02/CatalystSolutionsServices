/**
 * Normalises a website or online profile into the key used for duplicate
 * detection: lowercase, no protocol, no `www.`, no port, no query or fragment.
 *
 * Two partners typing "https://WWW.Acme.co.uk/pricing?ref=x" and "acme.co.uk"
 * must land on the same key, or deal protection means nothing.
 *
 * Social and profile hosts keep their handle: a business whose only presence is
 * instagram.com/acmeclinic is identified by that handle — collapsing it to
 * instagram.com would make every Instagram-only business the same client.
 */
const HANDLE_HOSTS = new Set([
  "instagram.com", "facebook.com", "fb.com", "m.facebook.com",
  "linkedin.com", "x.com", "twitter.com", "youtube.com", "t.me",
  "g.co", "goo.gl", "maps.app.goo.gl", "business.google.com", "g.page", "justdial.com",
]);

export function normaliseDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return "";

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // protocol
  s = s.replace(/^[^/@]*@/, "");                // user:pass@ or a pasted email local-part
  s = s.split(/[?#]/)[0];                       // query, fragment

  const [rawHost, ...pathParts] = s.split("/");
  let host = rawHost.replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.+$/, "");

  if (HANDLE_HOSTS.has(host)) {
    // Skip structural path segments so facebook.com/pages/acme and
    // linkedin.com/company/acme key on the name, not on "pages"/"company".
    const meaningful = pathParts.filter((p) => p && !["pages", "company", "in", "profile", "people", "pg", "kgs", "maps", "place"].includes(p));
    if (meaningful.length > 0) return `${host}/${meaningful[0]}`;
  }

  return host;
}

/**
 * Normalises a phone number into an identity key for businesses with no online
 * presence at all. Digits only; keyed on the last ten digits so
 * "+91 98765 43210", "098765 43210" and "98765-43210" all collide.
 */
export function normalisePhone(input: string): string {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 7) return "";
  return digits.slice(-10);
}

/** The synthetic identity key stored in client.domainNormalised for phone-only clients. */
export function phoneIdentityKey(phone: string): string {
  const n = normalisePhone(phone);
  return n ? `phone:${n}` : "";
}

export function isPhoneIdentity(domainNormalised: string): boolean {
  return domainNormalised.startsWith("phone:");
}

/** How a client identity reads on screen. Phone keys must not render as a fake URL. */
export function displayIdentity(domainNormalised: string): string {
  return isPhoneIdentity(domainNormalised)
    ? `no website — identified by phone ending ${domainNormalised.slice(-4)}`
    : domainNormalised;
}

/** A cheap sanity check — this is a duplicate key, not an email validator. */
export function looksLikeDomain(normalised: string): boolean {
  const host = normalised.split("/")[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && !normalised.includes("..");
}
