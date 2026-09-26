import { requireOrgPage } from "@/lib/os/guard";
import { can } from "@/lib/leados/rbac";
import { db } from "@/lib/audit/db";
import ApiKeyManager from "./ApiKeyManager";

export const metadata = { title: "API keys" };

export default async function ApiKeysPage() {
  const actor = await requireOrgPage();
  const keys = await db.losApiKey.findMany({
    where: { orgId: actor.orgId, revokedAt: null },
    orderBy: { createdAt: "desc" },
  });
  return (
    <ApiKeyManager
      canManage={can(actor.role, "apikeys.manage")}
      keys={keys.map((k) => ({
        id: k.id, name: k.name, prefix: k.prefix,
        createdAt: k.createdAt.toISOString(),
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      }))}
    />
  );
}
