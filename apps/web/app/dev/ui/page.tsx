import { notFound } from "next/navigation";
import { Button } from "../../../components/ui/button";
import { StatusChip } from "../../../components/status-chip";
import { InfoTip } from "../../../components/ui/chips";

export default function UiKitPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="stack">
      <h1>UI kit</h1>
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button disabled disabledReason="Fix the issues first">Disabled</Button>
      <StatusChip status="released" />
      <StatusChip status="ai_fail" />
      <InfoTip term="Locked" />
    </div>
  );
}
