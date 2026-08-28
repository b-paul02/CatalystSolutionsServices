"use client";

import { logout } from "../(auth)/actions";

export default function LogoutButton() {
  return (
    <button
      onClick={() => logout()}
      title="Sign out"
      className="flex items-center rounded-lg p-1.5 text-[var(--los-muted)] hover:bg-[var(--los-surface-2)] hover:text-[var(--los-fg)]"
    >
      <span className="material-symbols-outlined text-[20px]" aria-hidden>logout</span>
    </button>
  );
}
