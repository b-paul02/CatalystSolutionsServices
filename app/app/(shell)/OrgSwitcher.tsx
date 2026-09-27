"use client";

import { useActionState } from "react";
import { switchOrg } from "./_os/actions";

// Native <select> that submits on change. Staff with several client workspaces
// use this; a single-workspace user just sees the name.
export default function OrgSwitcher({ activeId, orgs }: { activeId: string; orgs: { id: string; name: string }[] }) {
  const [, action] = useActionState(switchOrg, {});
  if (orgs.length < 2) return <div className="truncate text-[11.5px] text-[var(--los-faint)]">{orgs[0]?.name}</div>;
  return (
    <form action={action}>
      <select
        name="orgId"
        defaultValue={activeId}
        aria-label="Switch workspace"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="max-w-[150px] truncate bg-transparent text-[11.5px] text-[var(--los-muted)]"
      >
        {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </form>
  );
}
