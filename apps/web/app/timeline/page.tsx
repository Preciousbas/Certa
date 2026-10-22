import { ProjectTimeline } from "../../components/project-timeline";
import { loadProject } from "../../lib/data";

export default async function TimelinePage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const data = await loadProject();
  const query = await searchParams;
  const cursor = Number(query.cursor ?? "0");
  if (!data) return <p>Nothing has happened on this project yet.</p>;
  return <ProjectTimeline projectId={data.project.id} cursor={Number.isFinite(cursor) ? cursor : 0} />;
}
