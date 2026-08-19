/**
 * Normalises a website into the key used for duplicate detection:
 * lowercase, no protocol, no `www.`, no port, no path, no query or fragment.
 *
 * Two partners typing "https://WWW.Acme.co.uk/pricing?ref=x" and "acme.co.uk"
 * must land on the same key, or deal protection means nothing.
 */
export function normaliseDomain(input: string): string {
  let s = input.trim().toLowerCase();
  if (!s) return "";

  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // protocol
  s = s.replace(/^[^/@]*@/, "");                // user:pass@ or a pasted email local-part
  s = s.split(/[/?#]/)[0];                      // path, query, fragment
  s = s.replace(/:\d+$/, "");                   // port
  s = s.replace(/^www\./, "");                  // the www that means nothing
  s = s.replace(/\.+$/, "");                    // trailing dot on a fully-qualified name

  return s;
}

/** A cheap sanity check — this is a duplicate key, not an email validator. */
export function looksLikeDomain(normalised: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normalised) && !normalised.includes("..");
}
