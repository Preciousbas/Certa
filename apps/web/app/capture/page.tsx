import { CaptureCamera } from "../../components/camera";
import { loadProject } from "../../lib/data";
import { stageOpenForCapture } from "../../../../src/server/verify/checks";

export default async function CapturePage() {
  const data = await loadProject();
  const stage = data?.stages.find((row) => stageOpenForCapture(row.status, row.funded));
  if (!data || !stage) return <p>No stage is open for a photo.</p>;
  const criteria = Array.isArray(stage.acceptanceCriteria)
    ? stage.acceptanceCriteria.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
  return (
    <CaptureCamera
      projectId={data.project.id}
      stageId={stage.id}
      stageName={stage.name}
      stageNumber={stage.stageIndex + 1}
      criteria={criteria}
      botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? ""}
    />
  );
}
