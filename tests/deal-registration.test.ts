import { describe, expect, it, vi, beforeEach } from "vitest";

type Client = { id: string; domainNormalised: string; isHouseAccount: boolean; existingClientSince: Date | null; legalName: string };
type Deal = { id: string; partnerId: string; clientId: string; stage: string; protectedUntil: Date; lastActivityAt: Date; registeredAt: Date; proposalSentAt: Date | null };

const clients: Client[] = [];
const deals: Deal[] = [];
const partners = new Map<string, { protectionDays: number; markets: string; status: string }>();
let seq = 0;

vi.mock("@/lib/audit/db", () => ({
  db: {
    partner: { findUnique: async ({ where }: { where: { id: string } }) => partners.get(where.id) ?? null },
    client: {
      findUnique: async ({ where }: { where: { domainNormalised: string } }) =>
        clients.find((c) => c.domainNormalised === where.domainNormalised) ?? null,
      create: async ({ data }: { data: { legalName: string; domainNormalised: string } }) => {
        const c: Client = { id: `c${++seq}`, legalName: data.legalName, domainNormalised: data.domainNormalised, isHouseAccount: false, existingClientSince: null };
        clients.push(c);
        return c;
      },
    },
    deal: {
      findMany: async ({ where }: { where: { clientId: string; stage: { in: string[] } } }) =>
        deals.filter((d) => d.clientId === where.clientId && where.stage.in.includes(d.stage)),
      findUnique: async ({ where }: { where: { id: string } }) => deals.find((d) => d.id === where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const d = { id: `d${++seq}`, ...data } as Deal;
        deals.push(d);
        return d;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Deal> }) => {
        Object.assign(deals.find((d) => d.id === where.id)!, data);
        return {};
      },
    },
    activity: { create: async () => ({}) },
    auditLog: { create: async () => ({}) },
  },
}));

const { registerDeal, logActivity, extendedProtection } = await import("@/lib/partner/deals");

const NOW = new Date("2026-08-19T12:00:00Z");
const DAY = 86400000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

const actorFor = (partnerId: string) => ({ userId: `u-${partnerId}`, email: `${partnerId}@x.com`, role: "partner" as const, partnerId });
const ALICE = actorFor("alice");
const BOB = actorFor("bob");

const base = {
  clientLegalName: "Acme Ltd", website: "https://www.acme.co.in/pricing", market: "IN", now: NOW,
};

beforeEach(() => {
  clients.length = 0; deals.length = 0; seq = 0;
  partners.clear();
  partners.set("alice", { protectionDays: 90, markets: '["IN","US"]', status: "active" });
  partners.set("bob", { protectionDays: 90, markets: '["IN"]', status: "active" });
});

describe("no match — protection granted", () => {
  it("registers a brand new account and protects it for the partner's window", async () => {
    const r = await registerDeal({ ...base, actor: ALICE });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.protectedUntil.toISOString().slice(0, 10)).toBe(days(90).toISOString().slice(0, 10));
    expect(clients[0].domainNormalised).toBe("acme.co.in");
  });

  it("honours a partner's own protection window rather than a fixed 90", async () => {
    partners.set("alice", { protectionDays: 45, markets: '["IN"]', status: "active" });
    const r = await registerDeal({ ...base, actor: ALICE });
    if (!r.ok) throw new Error("expected success");
    expect(r.protectedUntil.toISOString().slice(0, 10)).toBe(days(45).toISOString().slice(0, 10));
  });
});

describe("the done-when: two partners, one domain", () => {
  it("gives one partner the protected deal and the other a neutral rejection", async () => {
    const first = await registerDeal({ ...base, actor: ALICE });
    expect(first.ok).toBe(true);

    // Bob types it differently — normalisation still catches it.
    const second = await registerDeal({ ...base, actor: BOB, website: "ACME.co.in" });
    expect(second.ok).toBe(false);
    if (second.ok) return;

    expect(second.reason).toBe("already_registered");
    expect(second.message).toBe("This account is already registered.");

    // Nothing about Alice reaches Bob.
    const leaked = JSON.stringify(second).toLowerCase();
    for (const term of ["alice", "u-alice", "alice@x.com", "protected", "expires", "stage", "registered on"]) {
      expect(leaked, `leaked "${term}"`).not.toContain(term);
    }
    expect(deals).toHaveLength(1);
    expect(deals[0].partnerId).toBe("alice");
  });
});

describe("house accounts", () => {
  it("refuses an account Catalyst manages directly", async () => {
    clients.push({ id: "c9", legalName: "Acme", domainNormalised: "acme.co.in", isHouseAccount: true, existingClientSince: null });
    const r = await registerDeal({ ...base, actor: ALICE });
    expect(r).toMatchObject({ ok: false, reason: "house_account", message: "This account is managed directly by Catalyst." });
    expect(deals).toHaveLength(0);
  });

  it("refuses an existing Catalyst client", async () => {
    clients.push({ id: "c9", legalName: "Acme", domainNormalised: "acme.co.in", isHouseAccount: false, existingClientSince: new Date("2025-01-01") });
    const r = await registerDeal({ ...base, actor: ALICE });
    expect(r).toMatchObject({ ok: false, reason: "house_account" });
  });

  it("says nothing about who inside Catalyst manages it", async () => {
    clients.push({ id: "c9", legalName: "Acme", domainNormalised: "acme.co.in", isHouseAccount: true, existingClientSince: null });
    const r = await registerDeal({ ...base, actor: ALICE });
    if (r.ok) throw new Error("expected rejection");
    expect(r.message).toBe("This account is managed directly by Catalyst.");
  });
});

describe("expired protection", () => {
  it("lets a new partner in once protection lapsed and the deal went quiet for 30 days", async () => {
    clients.push({ id: "c1", legalName: "Acme", domainNormalised: "acme.co.in", isHouseAccount: false, existingClientSince: null });
    deals.push({
      id: "d1", partnerId: "alice", clientId: "c1", stage: "qualified",
      protectedUntil: days(-10), lastActivityAt: days(-40), registeredAt: days(-100), proposalSentAt: null,
    });
    const r = await registerDeal({ ...base, actor: BOB });
    expect(r.ok).toBe(true);
    expect(deals).toHaveLength(2);
  });

  it("keeps the account with the original partner if they are still working it", async () => {
    clients.push({ id: "c1", legalName: "Acme", domainNormalised: "acme.co.in", isHouseAccount: false, existingClientSince: null });
    deals.push({
      id: "d1", partnerId: "alice", clientId: "c1", stage: "qualified",
      protectedUntil: days(-2), lastActivityAt: days(-5), registeredAt: days(-100), proposalSentAt: null,
    });
    const r = await registerDeal({ ...base, actor: BOB });
    expect(r).toMatchObject({ ok: false, reason: "already_registered" });
  });

  it("ignores closed deals when deciding who holds an account", async () => {
    clients.push({ id: "c1", legalName: "Acme", domainNormalised: "acme.co.in", isHouseAccount: false, existingClientSince: null });
    deals.push({
      id: "d1", partnerId: "alice", clientId: "c1", stage: "lost",
      protectedUntil: days(60), lastActivityAt: days(-1), registeredAt: days(-30), proposalSentAt: null,
    });
    expect((await registerDeal({ ...base, actor: BOB })).ok).toBe(true);
  });
});

describe("registering your own account twice", () => {
  it("tells the partner plainly, without pretending someone else has it", async () => {
    await registerDeal({ ...base, actor: ALICE });
    const again = await registerDeal({ ...base, actor: ALICE });
    expect(again).toMatchObject({ ok: false, reason: "your_own_deal", message: "You have already registered this account." });
    expect(deals).toHaveLength(1);
  });
});

describe("input guards", () => {
  it("requires a website and a legal name", async () => {
    expect(await registerDeal({ ...base, actor: ALICE, website: "  " })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await registerDeal({ ...base, actor: ALICE, clientLegalName: " " })).toMatchObject({ ok: false, reason: "invalid" });
  });

  it("refuses a market the partner is not enabled for", async () => {
    const r = await registerDeal({ ...base, actor: BOB, market: "US" });
    expect(r).toMatchObject({ ok: false, reason: "invalid" });
    expect(deals).toHaveLength(0);
  });

  it("refuses a suspended partner", async () => {
    partners.set("alice", { protectionDays: 90, markets: '["IN"]', status: "suspended" });
    expect(await registerDeal({ ...base, actor: ALICE })).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("protection extension", () => {
  const registeredAt = new Date("2026-06-01T00:00:00Z");

  it("adds 30 days to a live window", () => {
    const out = extendedProtection({ registeredAt, protectedUntil: days(10), proposalSentAt: null, now: NOW });
    expect(out.toISOString().slice(0, 10)).toBe(days(40).toISOString().slice(0, 10));
  });

  it("counts from today when protection already lapsed", () => {
    const out = extendedProtection({ registeredAt, protectedUntil: days(-5), proposalSentAt: null, now: NOW });
    expect(out.toISOString().slice(0, 10)).toBe(days(30).toISOString().slice(0, 10));
  });

  it("caps at 180 days from registration until a proposal is sent", () => {
    const out = extendedProtection({
      registeredAt, protectedUntil: new Date("2026-11-20T00:00:00Z"), proposalSentAt: null, now: NOW,
    });
    expect(out.toISOString().slice(0, 10)).toBe("2026-11-28"); // 1 June + 180 days
  });

  it("lifts the cap once a proposal has gone out", () => {
    const out = extendedProtection({
      registeredAt, protectedUntil: new Date("2026-11-20T00:00:00Z"),
      proposalSentAt: new Date("2026-08-01T00:00:00Z"), now: NOW,
    });
    expect(out.toISOString().slice(0, 10)).toBe("2026-12-20");
  });
});

describe("logging activity", () => {
  it("extends protection and records the activity", async () => {
    const r = await registerDeal({ ...base, actor: ALICE });
    if (!r.ok) throw new Error("expected success");
    const { protectedUntil } = await logActivity({ actor: ALICE, dealId: r.dealId, type: "call", now: NOW });
    expect(protectedUntil.toISOString().slice(0, 10)).toBe(days(120).toISOString().slice(0, 10));
  });

  it("refuses to touch another partner's deal, and says only 'not found'", async () => {
    const r = await registerDeal({ ...base, actor: ALICE });
    if (!r.ok) throw new Error("expected success");
    await expect(logActivity({ actor: BOB, dealId: r.dealId, type: "call", now: NOW }))
      .rejects.toThrow("Deal not found.");
  });
});

describe("businesses with no website", () => {
  const noSite = { ...base, website: "", noWebsite: true };

  it("registers by phone and protects the deal", async () => {
    const r = await registerDeal({ ...noSite, actor: ALICE, contactPhone: "+91 98765 43210" });
    expect(r.ok).toBe(true);
    expect(clients[0].domainNormalised).toBe("phone:9876543210");
  });

  it("rejects the second partner however they format the same number", async () => {
    await registerDeal({ ...noSite, actor: ALICE, contactPhone: "+91 98765 43210" });
    const second = await registerDeal({ ...noSite, actor: BOB, contactPhone: "098765 43210" });
    expect(second).toMatchObject({ ok: false, reason: "already_registered", message: "This account is already registered." });
    expect(deals).toHaveLength(1);
  });

  it("requires a usable phone when there is no website", async () => {
    expect(await registerDeal({ ...noSite, actor: ALICE })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await registerDeal({ ...noSite, actor: ALICE, contactPhone: "123" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(deals).toHaveLength(0);
  });

  it("phone-keyed and domain-keyed clients never collide", async () => {
    await registerDeal({ ...noSite, actor: ALICE, contactPhone: "+91 98765 43210" });
    const r = await registerDeal({ ...base, actor: BOB, website: "acme.co.in" });
    expect(r.ok).toBe(true);
    expect(clients.map((c) => c.domainNormalised).sort()).toEqual(["acme.co.in", "phone:9876543210"]);
  });

  it("ignores the website field entirely when noWebsite is set", async () => {
    // A stale value left in the hidden field must not become the identity.
    const r = await registerDeal({ ...noSite, actor: ALICE, website: "acme.co.in", contactPhone: "+91 98765 43210" });
    expect(r.ok).toBe(true);
    expect(clients[0].domainNormalised).toBe("phone:9876543210");
  });

  it("a phone-identified house account is still refused", async () => {
    clients.push({ id: "c9", legalName: "Acme", domainNormalised: "phone:9876543210", isHouseAccount: true, existingClientSince: null });
    const r = await registerDeal({ ...noSite, actor: ALICE, contactPhone: "98765 43210" });
    expect(r).toMatchObject({ ok: false, reason: "house_account" });
  });
});
