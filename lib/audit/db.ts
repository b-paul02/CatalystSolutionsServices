import { PrismaClient } from "@prisma/client";
import { assertSafeDatabase } from "@/lib/dbGuard";

const g = globalThis as unknown as { prisma?: PrismaClient };
// Prisma only reads .env lazily; load nothing here — Next / the script runner has
// already populated process.env. Outside production a remote database is refused.
if (!g.prisma) assertSafeDatabase();
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

export async function logEvent(leadId: string, type: string, data?: unknown) {
  await db.event.create({
    data: { leadId, type, data: data === undefined ? null : JSON.stringify(data) },
  });
}
