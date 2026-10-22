import { ProjectTimeline } from "../../../../../components/project-timeline";

export default async function ProjectTimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const cursor = Number(query.cursor ?? "0");
  return <ProjectTimeline projectId={projectId} cursor={Number.isFinite(cursor) ? cursor : 0} />;
}
