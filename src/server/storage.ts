import { createHash } from "node:crypto";

export const STORAGE_BUCKETS = ["documents", "photos", "certificates"] as const;

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function storageConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

async function storageFetch(path: string, init: RequestInit): Promise<Response> {
  const config = storageConfig();
  if (!config) throw new StorageError("Storage is not configured.");
  return fetch(`${config.url}/storage/v1/${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${config.key}`,
      apikey: config.key,
      ...(init.headers ?? {}),
    },
  });
}

export function objectKey(input: {
  workspaceId: string;
  projectId: string;
  ext: string;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${input.workspaceId}/${input.projectId}/${yyyy}/${mm}/${crypto.randomUUID()}.${input.ext}`;
}

export async function putObject(input: {
  bucket: string;
  key: string;
  bytes: Uint8Array;
  contentType: string;
  sha256: string;
}) {
  const digest = sha256(input.bytes);
  if (digest !== input.sha256) throw new StorageError("The file hash does not match.");
  const response = await storageFetch(`object/${input.bucket}/${input.key}`, {
    method: "POST",
    headers: { "content-type": input.contentType, "x-upsert": "true" },
    body: Buffer.from(input.bytes),
  });
  if (!response.ok) throw new StorageError("The file could not be stored.");
  return { key: input.key, sha256: digest };
}

export async function getObject(
  bucket: string,
  key: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const response = await storageFetch(`object/${bucket}/${key}`, { method: "GET" });
  if (response.status === 404) return null;
  if (!response.ok) throw new StorageError("The file could not be read.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { bytes, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}

export async function signedUrl(bucket: string, key: string, ttlSeconds = 300): Promise<string> {
  const response = await storageFetch(`object/sign/${bucket}/${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expiresIn: ttlSeconds }),
  });
  if (!response.ok) throw new StorageError("A signed link could not be created.");
  const body = (await response.json()) as { signedURL?: string };
  const config = storageConfig();
  if (!config || !body.signedURL) throw new StorageError("A signed link could not be created.");
  return body.signedURL.startsWith("http")
    ? body.signedURL
    : `${config.url}/storage/v1${body.signedURL}`;
}

async function bucketsFromDatabase(): Promise<"ok" | "error" | "unconfigured"> {
  if (!process.env.DATABASE_URL) return "unconfigured";
  try {
    const { getDatabase } = await import("@certa/db");
    const { sql } = await import("drizzle-orm");
    const db = await getDatabase();
    const result = await db.execute(
      sql`select id, public from storage.buckets where id in ('documents', 'photos', 'certificates')`,
    );
    const rows = (
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    ) as {
      id: string;
      public: boolean;
    }[];
    if (rows.length !== 3) return "error";
    if (rows.some((row) => row.public === true)) return "error";
    return "ok";
  } catch {
    return "unconfigured";
  }
}

export async function storageHealth(): Promise<"ok" | "error" | "unconfigured"> {
  if (!storageConfig()) return bucketsFromDatabase();
  try {
    for (const name of STORAGE_BUCKETS) {
      const response = await storageFetch(`bucket/${name}`, { method: "GET" });
      if (!response.ok) return "error";
      const body = (await response.json()) as { public?: boolean };
      if (body.public === true) return "error";
    }
    return "ok";
  } catch {
    return "error";
  }
}
