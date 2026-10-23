const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PRIVATE = /(?:0x[a-fA-F0-9]{64}|sk_(?:live|test)_[A-Za-z0-9]+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;
const DROP_KEY = /password|secret|token|authorization|cookie|private|initdata|dsn|body|email/i;
const DROP_HEADER = /authorization|cookie|token|secret|init|private|dsn/i;

type HeaderBag = Record<string, string | undefined>;

export type Scrubbable = {
  message?: string;
  user?: unknown;
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: HeaderBag;
    url?: string;
  };
  extra?: unknown;
  breadcrumbs?: unknown;
};

function redactString(value: string): string {
  return value.replace(EMAIL, "[redacted]").replace(PRIVATE, "[redacted]");
}

function walk(value: unknown): unknown {
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map(walk);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] = DROP_KEY.test(key) ? "[redacted]" : walk(item);
  }
  return out;
}

/** Drops emails, private keys, tokens, and request bodies before an event leaves the process. */
export function scrubEvent<T extends object>(event: T): T {
  const record = event as T & Scrubbable;
  if (record.request) {
    delete record.request.data;
    delete record.request.cookies;
    const headers = record.request.headers;
    if (headers) {
      for (const key of Object.keys(headers)) {
        if (DROP_HEADER.test(key)) delete headers[key];
      }
    }
    if (record.request.url) {
      const pathOnly = record.request.url.split("?")[0];
      record.request.url = pathOnly ?? record.request.url;
    }
  }
  delete record.user;
  delete record.extra;
  return walk(record) as T;
}
