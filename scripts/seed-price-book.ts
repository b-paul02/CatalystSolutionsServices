// Seeds the PriceBook table from lib/programs.ts — the repo's existing source of
// truth for prices (verbatim from CATALYST_COMMERCIAL_SYSTEM.md). Numbers are
// never retyped here: they are parsed from the display strings and converted to
// integer minor units.
//
// Run:  npm run seed:price-book
//
// Idempotent: re-running updates existing rows in place, keyed on
// (market, program, tier). India and US are seeded as independent books.

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Node's --experimental-strip-types needs the explicit .ts extension, which tsc
// rejects unless allowImportingTsExtensions is on. Loading through a variable
// specifier keeps both happy without touching the shared tsconfig.
const PROGRAMS_MODULE = "../lib/programs.ts";
const { programs } = (await import(PROGRAMS_MODULE)) as typeof import("../lib/programs");

/** "₹1,75,000" → 17500000n · "$9,500" → 950000n · "₹9,999/mo" → 999900n */
function parseMoney(display: string): bigint {
  const cleaned = display.replace(/\/mo\b/i, "").replace(/[^0-9.]/g, "");
  if (!cleaned) throw new Error(`Cannot parse money from "${display}"`);
  const [whole, fraction = ""] = cleaned.split(".");
  const paise = (fraction + "00").slice(0, 2);
  return BigInt(whole) * 100n + BigInt(paise);
}

const MARKETS = [
  { market: "IN", currency: "INR", key: "in" as const },
  { market: "US", currency: "USD", key: "us" as const },
];

async function main() {
  let written = 0;
  const skipped: string[] = [];

  for (const program of programs) {
    for (const tier of program.tiers) {
      if (!tier.setup) {
        skipped.push(`${program.name} · ${tier.label} (no onboarding price)`);
        continue;
      }
      for (const { market, currency, key } of MARKETS) {
        const onboardingFee = parseMoney(tier.setup[key]);
        // The Growth Plan is stored so it can be DISPLAYED to partners. It is
        // never commissionable and never enters a quote.
        const growthPlanMonthly = tier.monthly ? parseMoney(tier.monthly[key]) : null;

        await db.priceBook.upsert({
          where: { market_program_tier: { market, program: program.name, tier: tier.label } },
          update: {
            currency,
            family: program.slug,
            familyLabel: program.name,
            packageName: tier.name,
            onboardingFee,
            growthPlanMonthly,
            guardrails: tier.guardrails?.length ? JSON.stringify(tier.guardrails) : null,
            billingSchedule: "50_50",
          },
          create: {
            market,
            currency,
            family: program.slug,
            familyLabel: program.name,
            program: program.name,
            tier: tier.label,
            packageName: tier.name,
            onboardingFee,
            growthPlanMonthly,
            guardrails: tier.guardrails?.length ? JSON.stringify(tier.guardrails) : null,
            billingSchedule: "50_50",
          },
        });
        written++;
      }
    }
  }

  const counts = await db.priceBook.groupBy({ by: ["market"], _count: { _all: true } });
  console.log(`Seeded ${written} price book rows.`);
  for (const c of counts) console.log(`  ${c.market}: ${c._count._all}`);
  if (skipped.length) {
    console.log("Skipped (no onboarding price):");
    for (const s of skipped) console.log(`  ${s}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => db.$disconnect());
