// LeadOS role-based access control. Deny by default: a permission exists only
// if a role's set names it. Static matrix in code — testable, reviewable, and
// versioned with the features that use it (blueprint §4).

export const CLIENT_ROLES = [
  "owner",
  "admin",
  "campaign_manager",
  "sales_manager",
  "sales_rep",
  "analyst",
] as const;
export type ClientRole = (typeof CLIENT_ROLES)[number];

// Catalyst delivery staff working INSIDE a client workspace (CatalystGrowthOS).
// Deliberately not in CLIENT_ROLES: invites and role changes validate with
// isClientRole, so a client can never grant (or strip) a staff role — only the
// platform admin console creates these memberships.
export const STAFF_ROLES = ["cgo_lead", "cgo_specialist", "cgo_reviewer", "cgo_freelancer"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const PLATFORM_ROLES = [
  "super_admin",
  "compliance_admin",
  "inventory_admin",
  "campaign_admin",
  "support_admin",
  "auditor",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

// Client-side permissions. View/export/contact/delete are deliberately separate
// (blueprint §4.3). Grows with later phases.
export type Permission =
  | "org.manage" // rename, billing contact, delete org
  | "org.billing" // subscription, token purchases
  | "team.manage" // invite, remove, change roles
  | "apikeys.manage"
  | "leads.view"
  | "leads.edit"
  | "leads.import"
  | "leads.export"
  | "leads.delete"
  | "leads.assign"
  | "leads.contact" // outreach sends
  | "campaigns.view"
  | "campaigns.manage" // create, edit, launch, pause
  | "pipeline.manage" // stages config, assignment rules
  | "reports.view"
  // ── CatalystGrowthOS ──
  | "work.view" // see every work item in the workspace (freelancers lack it: assigned-only)
  | "work.request" // raise a service / change request
  | "work.manage" // scope, assign, prioritise, close — staff
  | "work.execute" // do the work, log time, add deliverables — staff
  | "work.review" // internal QA and verification — staff
  | "approvals.decide" // client sign-off (tier ≤ 2)
  | "spend.approve" // tier-3 sign-off: spend, production release, large sends
  | "contract.sign"
  | "strategy.manage" // goals, plans, baselines, findings — staff
  | "os.settings"; // brand profile, connections, autonomy, kill switch

const ALL: Permission[] = [
  "org.manage", "org.billing", "team.manage", "apikeys.manage",
  "leads.view", "leads.edit", "leads.import", "leads.export", "leads.delete", "leads.assign", "leads.contact",
  "campaigns.view", "campaigns.manage", "pipeline.manage", "reports.view",
  // client-side OS permissions; staff-only ones (work.manage/execute/review, strategy.manage) are NOT here
  "work.view", "work.request", "approvals.decide", "spend.approve", "contract.sign", "os.settings",
];

const MATRIX: Record<ClientRole | StaffRole, readonly Permission[]> = {
  owner: ALL,
  // separation of duties: an admin approves publishing but not spend or contracts
  admin: ALL.filter((p) => p !== "org.manage" && p !== "spend.approve" && p !== "contract.sign"),
  campaign_manager: [
    "leads.view", "leads.import", "campaigns.view", "campaigns.manage", "reports.view",
    "work.view", "work.request", "approvals.decide",
  ],
  sales_manager: [
    "leads.view", "leads.edit", "leads.assign", "leads.contact", "leads.export",
    "campaigns.view", "pipeline.manage", "reports.view", "work.view", "work.request",
  ],
  sales_rep: ["leads.view", "leads.edit", "leads.contact", "campaigns.view", "work.view"],
  analyst: ["leads.view", "campaigns.view", "reports.view", "work.view"],
  // staff never hold approvals.decide / spend.approve / contract.sign — Catalyst cannot approve its own work
  cgo_lead: [
    "work.view", "work.request", "work.manage", "work.execute", "work.review", "strategy.manage", "os.settings",
    "leads.view", "campaigns.view", "campaigns.manage", "reports.view",
  ],
  cgo_specialist: ["work.view", "work.execute", "campaigns.view", "reports.view"],
  cgo_reviewer: ["work.view", "work.review", "reports.view"],
  cgo_freelancer: ["work.execute"],
};

export function can(role: string, permission: Permission): boolean {
  const perms = MATRIX[role as ClientRole | StaffRole];
  return perms ? perms.includes(permission) : false;
}

export function isClientRole(role: string): role is ClientRole {
  return (CLIENT_ROLES as readonly string[]).includes(role);
}

export function isStaffRole(role: string): role is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function isPlatformRole(role: string): role is PlatformRole {
  return (PLATFORM_ROLES as readonly string[]).includes(role);
}

// Platform-side permission checks are coarse-grained by area (blueprint §4.1).
export type PlatformArea =
  | "platform.full" // super_admin only
  | "compliance" // dataset approval, suppression, privacy requests
  | "inventory" // dataset import, inventory management
  | "campaign_review" // campaign approval, allocation config
  | "support" // restricted troubleshooting
  | "audit_read"; // read-only evidence and logs

const PLATFORM_MATRIX: Record<PlatformRole, readonly PlatformArea[]> = {
  super_admin: ["platform.full", "compliance", "inventory", "campaign_review", "support", "audit_read"],
  compliance_admin: ["compliance", "audit_read"],
  inventory_admin: ["inventory"],
  campaign_admin: ["campaign_review"],
  support_admin: ["support"],
  auditor: ["audit_read"],
};

export function canPlatform(role: string, area: PlatformArea): boolean {
  const areas = PLATFORM_MATRIX[role as PlatformRole];
  return areas ? areas.includes(area) : false;
}
