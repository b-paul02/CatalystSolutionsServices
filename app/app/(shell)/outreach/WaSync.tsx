import ActionForm from "@/components/os/ActionForm";
import { waTemplatesSync } from "../_os/phase3";

// WP-45 · pull WhatsApp templates + approval status from Twilio Content into the template list.
export default function WaSync() {
  return <ActionForm action={waTemplatesSync} submit="Sync WhatsApp templates" tone="ghost" />;
}
