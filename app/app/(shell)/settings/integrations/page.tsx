import { redirect } from "next/navigation";

// Replaced by the unified Connections page (WP-01). Kept so old bookmarks still land somewhere useful.
export default function IntegrationsPage() { redirect("/app/settings/connections"); }
