import { redirect } from "next/navigation";
import { currentLosActor } from "@/lib/leados/auth";
import MfaForm from "./MfaForm";

export const metadata = { title: "Two-factor code" };

export default async function MfaPage() {
  const actor = await currentLosActor();
  if (!actor) redirect("/app/login");
  if (!actor.mfaPending) redirect("/app/dashboard");
  return <MfaForm />;
}
