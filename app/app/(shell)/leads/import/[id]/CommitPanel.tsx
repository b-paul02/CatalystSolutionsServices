"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { commitImport } from "../../actions";
import { SubmitButton } from "@/components/leados/ui";

export default function CommitPanel({ importId, committing = false }: { importId: string; committing?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  // While committing, poll for the report.
  useEffect(() => {
    if (!committing) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [committing, router]);

  if (committing) {
    return (
      <div className="rounded-xl border border-[var(--los-line)] bg-[var(--los-surface)] p-6 text-center text-[14px] text-[var(--los-muted)]">
        Importing… verifying contacts and checking duplicates. This page refreshes automatically.
      </div>
    );
  }
  return (
    <form
      action={() =>
        start(async () => {
          await commitImport(importId);
          router.refresh();
        })
      }
    >
      <SubmitButton>{pending ? "Starting…" : "Run import"}</SubmitButton>
    </form>
  );
}
