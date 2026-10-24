/** The open project is the one in /app/p/<id>/..., then the bot's current project. */
export function selectedProjectId(
  projects: { id: string }[],
  path: string,
  currentId: string | null,
): string | undefined {
  const match = path.match(/\/app\/p\/([^/]+)/);
  const fromPath = match?.[1] ? decodeURIComponent(match[1]) : "";
  if (fromPath && projects.some((project) => project.id === fromPath)) return fromPath;
  if (currentId && projects.some((project) => project.id === currentId)) return currentId;
  return projects[0]?.id;
}
