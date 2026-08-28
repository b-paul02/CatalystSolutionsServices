// Lead domain: normalization, field catalog, mapping suggestion, validation.
// Pure functions — the import/create actions and API call these.

export const LEAD_STATUSES = ["new", "assigned", "contacted", "engaged", "qualified", "converted", "lost"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Lowercased, trimmed; gmail dots/plus preserved (people expect exact match). */
export function normalizeEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : null;
}

/**
 * Digits-only with country handling for the two launch markets:
 * IN mobile (10 digits starting 6-9) → +91…, US 10 digits → +1…,
 * already-prefixed international kept as-is.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    return rest.length >= 8 && rest.length <= 15 ? `+${rest}` : null;
  }
  const d = digits.replace(/\D/g, "");
  if (d.length === 10 && /^[6-9]/.test(d)) return `+91${d}`;
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("0") && /^[6-9]/.test(d[1])) return `+91${d.slice(1)}`;
  if (d.length === 11 && d.startsWith("1")) return `+1${d.slice(1)}`;
  if (d.length === 12 && d.startsWith("91")) return `+${d}`;
  return d.length >= 8 && d.length <= 15 ? `+${d}` : null;
}

/** Company domain: lowercase, strip protocol/www/path. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  let s = (raw ?? "").trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : null;
}

// ── import field catalog ─────────────────────────────────────────────────────

export type LeadField = {
  key: string;
  label: string;
  /** header aliases for mapping suggestion (lowercased, non-alnum stripped) */
  aliases: string[];
  b2bOnly?: boolean;
  b2cOnly?: boolean;
};

export const LEAD_FIELDS: LeadField[] = [
  { key: "firstName", label: "First name", aliases: ["firstname", "first", "fname", "givenname", "name"] },
  { key: "lastName", label: "Last name", aliases: ["lastname", "last", "lname", "surname", "familyname"] },
  { key: "email", label: "Email", aliases: ["email", "emailaddress", "mail", "workemail"] },
  { key: "phone", label: "Phone", aliases: ["phone", "phonenumber", "mobile", "mobilenumber", "contact", "contactnumber", "whatsapp"] },
  { key: "city", label: "City", aliases: ["city", "town"] },
  { key: "state", label: "State", aliases: ["state", "province", "region"] },
  { key: "country", label: "Country", aliases: ["country", "nation"] },
  { key: "language", label: "Language", aliases: ["language", "lang", "preferredlanguage"] },
  { key: "companyName", label: "Company name", aliases: ["company", "companyname", "organisation", "organization", "business", "businessname"], b2bOnly: true },
  { key: "companyDomain", label: "Company domain", aliases: ["domain", "website", "companywebsite", "url", "companydomain"], b2bOnly: true },
  { key: "jobTitle", label: "Job title", aliases: ["jobtitle", "title", "designation", "role", "position"], b2bOnly: true },
  { key: "department", label: "Department", aliases: ["department", "dept", "function"], b2bOnly: true },
  { key: "seniority", label: "Seniority", aliases: ["seniority", "level"], b2bOnly: true },
  { key: "productInterest", label: "Product interest", aliases: ["productinterest", "interest", "interestedin", "product", "service"], b2cOnly: true },
  { key: "budgetBand", label: "Budget band", aliases: ["budget", "budgetband", "budgetrange"], b2cOnly: true },
  { key: "purchaseTimeline", label: "Purchase timeline", aliases: ["timeline", "purchasetimeline", "when", "timeframe"], b2cOnly: true },
  { key: "preferredChannel", label: "Preferred channel", aliases: ["preferredchannel", "channel", "contactpreference"], b2cOnly: true },
  { key: "tags", label: "Tags", aliases: ["tags", "tag", "labels", "segment"] },
];

export function fieldsForType(leadType: "b2b" | "b2c"): LeadField[] {
  return LEAD_FIELDS.filter((f) => (leadType === "b2b" ? !f.b2cOnly : !f.b2bOnly));
}

function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** header → field key suggestion. Exact alias match only — no fuzzy magic. */
export function suggestMapping(headers: string[], leadType: "b2b" | "b2c"): Record<string, string> {
  const fields = fieldsForType(leadType);
  const out: Record<string, string> = {};
  const used = new Set<string>();
  for (const header of headers) {
    const h = squash(header);
    const hit = fields.find((f) => !used.has(f.key) && (f.key.toLowerCase() === h || f.aliases.includes(h)));
    if (hit) {
      out[header] = hit.key;
      used.add(hit.key);
    }
  }
  return out;
}

// ── row validation ───────────────────────────────────────────────────────────

export type RowIssue = { row: number; problem: string };

export type ParsedLeadRow = {
  fields: Record<string, string>;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
};

/**
 * Applies a mapping to a raw row and validates. A row is acceptable when it
 * yields at least one usable contact point (email or phone).
 */
export function buildRow(
  headers: string[],
  row: string[],
  mapping: Record<string, string>,
): ParsedLeadRow {
  const fields: Record<string, string> = {};
  headers.forEach((h, i) => {
    const key = mapping[h];
    const value = (row[i] ?? "").trim();
    if (key && value) fields[key] = value;
  });
  return {
    fields,
    normalizedEmail: normalizeEmail(fields.email),
    normalizedPhone: normalizePhone(fields.phone),
  };
}

// ── CSV export safety ────────────────────────────────────────────────────────

/** Formula-injection-safe CSV cell (blueprint §12). */
export function csvCell(value: unknown): string {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\r\n");
}
