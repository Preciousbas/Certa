export const BOTTOM_NAV = [
  { id: "timeline", label: "Timeline" },
  { id: "stages", label: "Stages" },
  { id: "fund", label: "Fund" },
  { id: "changes", label: "Changes" },
  { id: "more", label: "More" },
] as const;

export const MORE_NAV = [
  { id: "reports", label: "Reports" },
  { id: "documents", label: "Documents" },
  { id: "people", label: "People" },
  { id: "wallet", label: "Wallet" },
  { id: "billing", label: "Billing" },
  { id: "settings", label: "Settings" },
] as const;

export function sectionHref(projectId: string | null, id: string): string {
  if (id === "wallet") return "/wallet";
  if (id === "billing") return "/billing";
  if (!projectId) {
    if (id === "timeline") return "/app";
    if (id === "reports") return "/report";
    if (id === "documents") return "/upload";
    return `/${id}`;
  }
  if (id === "timeline") return `/app/p/${projectId}/timeline`;
  if (id === "reports") return `/app/p/${projectId}/reports`;
  if (id === "documents") return `/app/p/${projectId}/documents`;
  if (id === "people") return `/app/p/${projectId}/people`;
  if (id === "settings") return `/app/p/${projectId}/settings`;
  return `/app/p/${projectId}/${id}`;
}
