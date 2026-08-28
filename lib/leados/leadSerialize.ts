// JSON shape for /api/v1 lead responses.
export function serializeLead(l: {
  id: string; leadType: string; source: string; firstName: string | null; lastName: string | null;
  email: string | null; emailStatus: string; phone: string | null; phoneStatus: string;
  city: string | null; state: string | null; country: string | null; status: string;
  qualityScore: number | null; intentScore: number | null; createdAt: Date;
  company?: { name: string; domain: string | null } | null;
  b2b?: { jobTitle: string | null; department: string | null } | null;
  b2c?: { productInterest: string | null; permittedChannels: string | null; suppressedAt: Date | null } | null;
}) {
  return {
    id: l.id,
    leadType: l.leadType,
    source: l.source,
    firstName: l.firstName,
    lastName: l.lastName,
    email: l.email,
    emailStatus: l.emailStatus,
    phone: l.phone,
    phoneStatus: l.phoneStatus,
    city: l.city,
    state: l.state,
    country: l.country,
    status: l.status,
    qualityScore: l.qualityScore,
    intentScore: l.intentScore,
    createdAt: l.createdAt.toISOString(),
    company: l.company ? { name: l.company.name, domain: l.company.domain } : null,
    b2b: l.b2b ? { jobTitle: l.b2b.jobTitle, department: l.b2b.department } : null,
    b2c: l.b2c ? { productInterest: l.b2c.productInterest, suppressed: Boolean(l.b2c.suppressedAt) } : null,
  };
}
