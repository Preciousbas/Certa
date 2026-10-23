export type DocumentChip = {
  id: string;
  name: string;
  status: "Uploaded" | "Reading" | "Read" | "Failed";
  progress: number;
  retry: boolean;
};

export function documentOpenForResend(row: { status: string; parseStatus: string | null }): boolean {
  if (row.status === "failed" || row.parseStatus === "failed") return true;
  if (row.status === "parsed" || row.parseStatus === "parsed") return false;
  return true;
}

export function documentChip(row: { id: string; fileName: string | null; status: string; parseStatus: string | null }): DocumentChip {
  const failed = row.status === "failed" || row.parseStatus === "failed";
  const read = row.status === "parsed" || row.parseStatus === "parsed";
  const retry = documentOpenForResend(row);
  const status = failed ? "Failed" : read ? "Read" : "Reading";
  return {
    id: row.id,
    name: row.fileName ?? "File",
    status,
    progress: failed || read ? 100 : 45,
    retry,
  };
}
