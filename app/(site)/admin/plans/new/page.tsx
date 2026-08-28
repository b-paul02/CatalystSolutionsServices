import PlanEditor from "../PlanEditor";

export const metadata = { title: "New Custom Plan", robots: { index: false } };

export default function NewPlanPage() {
  return <PlanEditor initial={{ customerName: "", email: "", market: "in", expiresAt: "", program: null }} />;
}
