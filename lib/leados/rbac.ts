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
  | "reports.view";

const ALL: Permission[] = [
  "org.manage", "org.billing", "team.manage", "apikeys.manage",
  "leads.view", "leads.edit", "leads.import", "leads.export", "leads.delete", "leads.assign", "leads.contact",
  "campaigns.view", "campaigns.manage", "pipeline.manage", "reports.view",
];

const MATRIX: Record<ClientRole, readonly Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== "org.manage"),
  campaign_manager: [
    "leads.view", "leads.import", "campaigns.view", "campaigns.manage", "reports.view",
  ],
  sales_manager: [
    "leads.view", "leads.edit", "leads.assign", "leads.contact", "leads.export",
    "campaigns.view", "pipeline.manage", "reports.view",
  ],
  sales_rep: ["leads.view", "leads.edit", "leads.contact", "campaigns.view"],
  analyst: ["leads.view", "campaigns.view", "reports.view"],
};

export function can(role: string, permission: Permission): boolean {
  const perms = MATRIX[role as ClientRole];
  return perms ? perms.includes(permission) : false;
}

export function isClientRole(role: string): role is ClientRole {
  return (CLIENT_ROLES as readonly string[]).includes(role);
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
