import { eq } from "drizzle-orm";
import { getDatabase, stages } from "@certa/db";
import { CaptureCamera } from "../../../components/camera";
import { loadProject } from "../../../lib/data";
import { stageOpenForCapture } from "../../../../../src/server/verify/checks";

export default async function MiniCapturePage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const query = await searchParams;
  const data = await loadProject();
  if (!data) return <p>No stage is open for a photo.</p>;
  const db = await getDatabase();
  const requested = query.stage
    ? (await db.select().from(stages).where(eq(stages.id, query.stage)))[0]
    : undefined;
  const stage =
    requested && requested.projectId === data.project.id && stageOpenForCapture(requested.status, requested.funded)
      ? requested
      : data.stages.find((row) => stageOpenForCapture(row.status, row.funded));
  if (!stage) return <p>No stage is open for a photo.</p>;
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
