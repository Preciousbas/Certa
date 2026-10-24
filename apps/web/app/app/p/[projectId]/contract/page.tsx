import { contractVersions, getDatabase } from "@certa/db";
import { eq } from "drizzle-orm";
import { contractPlanCopy, planIsAccepted } from "../../../../../lib/contract-plan";

export default async function ContractPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const db = await getDatabase();
  const versions = await db.select({ status: contractVersions.status }).from(contractVersions).where(eq(contractVersions.projectId, projectId));
  const accepted = planIsAccepted(versions);
  return (
    <div>
      <p className="eyebrow">Contract</p>
      <h1>Payment plan</h1>
      <p className="muted">{contractPlanCopy(accepted)}</p>
      {accepted ? null : (
        <p>
          <a href={`/app/p/${projectId}/contract/review`}>Review figures</a>
        </p>
      )}
      <details>
        <summary>Show technical details</summary>
        <p className="faint">Document fingerprints are the first 12 characters of each file sha256.</p>
      </details>
    </div>
  );
}
