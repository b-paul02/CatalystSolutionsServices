import { PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;

export async function logEvent(leadId: string, type: string, data?: unknown) {
  await db.event.create({
    data: { leadId, type, data: data === undefined ? null : JSON.stringify(data) },
  });
}
