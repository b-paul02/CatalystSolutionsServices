// An uninvited sign-up becomes an access request: one row waiting in the admin, no account, a confirmation for the person.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("./entry-harness")).nextHeadersMock);
vi.mock("next/navigation", async () => (await import("./entry-harness")).nextNavigationMock);

import { db } from "@/lib/audit/db";
import { form } from "./entry-harness";
import { register } from "@/app/app/(auth)/actions";

const email = `ar-${Date.now()}@example.com`;
afterAll(async () => { await db.cosAccessRequest.deleteMany({ where: { email } }); });

describe("uninvited sign-up", () => {
  it("leaves one pending request and creates no account", async () => {
    delete process.env.GROWTHOS_SELF_SERVICE;
    const input = () => form({ name: "Synthetic Person", company: "Synthetic Co", website: "synthetic.example", email, password: `synthetic-${Date.now()}-pw` });

    const first = await register({}, input());
    expect(first.error).toBeUndefined();
    expect(first.ok).toMatch(/Request sent/);

    const again = await register({}, input());
    expect(again.ok).toBe(first.ok);

    const rows = await db.cosAccessRequest.findMany({ where: { email } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "pending", name: "Synthetic Person", company: "Synthetic Co", website: "synthetic.example" });
    expect(await db.losUser.findUnique({ where: { email } })).toBeNull();
  });

  it("a declined request stays declined when the person asks again", async () => {
    await db.cosAccessRequest.update({ where: { email }, data: { status: "declined" } });
    await register({}, form({ name: "Synthetic Person", email, password: `synthetic-${Date.now()}-pw` }));
    expect((await db.cosAccessRequest.findUnique({ where: { email } }))?.status).toBe("declined");
  });
});
