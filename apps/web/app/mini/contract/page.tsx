import { redirect } from "next/navigation";
import { loadProject } from "../../../lib/data";

export default async function MiniContractPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const query = await searchParams;
  const requested = query.project?.trim();
  if (requested) redirect(`/app/p/${requested}/contract/review`);
  const data = await loadProject();
  if (!data) return <p>No agreement is open.</p>;
  redirect(`/app/p/${data.project.id}/contract/review`);
}
