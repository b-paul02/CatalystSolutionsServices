import { redirect } from "next/navigation";
import { currentLosActor } from "@/lib/leados/auth";

export default async function LeadosHome() {
  const actor = await currentLosActor();
  if (!actor) redirect("/app/login");
  redirect(actor.mfaPending ? "/app/mfa" : "/app/dashboard");
}
