import { AppFrame } from "./ui/frame";

export function Shell({
  children,
  sample = false,
  syncing = false,
  projectId = null,
  projects = [],
  factory,
  factoryHref,
  supportEmail,
  fxLine,
}: {
  children: React.ReactNode;
  sample?: boolean;
  role?: "client" | "consultant" | "contractor" | "subcontractor";
  admin?: boolean;
  syncing?: boolean;
  projectId?: string | null;
  projects?: { id: string; name: string }[];
  factory: string;
  factoryHref: string;
  supportEmail: string;
  fxLine: string | null;
}) {
  return (
    <AppFrame
      sample={sample}
      syncing={syncing}
      projectId={projectId}
      projects={projects}
      factory={factory}
      factoryHref={factoryHref}
      supportEmail={supportEmail}
      fxLine={fxLine}
    >
      {children}
    </AppFrame>
  );
}
