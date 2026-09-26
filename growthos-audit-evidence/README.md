# Audit evidence — 2026-09-21

Audit-only. Nothing here is part of the implementation test suite (`vitest.config.ts` includes `tests/**` only).
No secrets, no connection strings, no client records.

| File | What it is |
|---|---|
| `audit-checks.test.ts` | 8 purpose-built verification checks (AI permissions, schema absence, zero-allowance execution, 25-way concurrency, token separation, cross-tenant assets/export/work, zero-balance manual function) |
| `vitest.audit.config.ts` | Separate runner so these never join the implementation suite |
| `audit-checks-run.txt` | Result: 8/8 passed |
| `vitest-full-run.txt` | Full implementation suite re-run: 41 files / 465 tests passed |
| `http-negative-checks.txt` | Unauthenticated / unsigned HTTP probes against the live dev server |

Run the audit checks:
    npx vitest run --config growthos-audit-evidence/vitest.audit.config.ts

Screenshots: the browser tooling returns images inline and cannot write files, so durable evidence here is textual.
Visual QA, keyboard-only and screen-reader passes were NOT performed.
