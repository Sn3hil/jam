import type { ErrorBody } from "@shared/protocol";

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = "ApiRequestError";
  }
}

export async function apiFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const method = init?.method ?? (init?.body !== undefined ? "POST" : "GET");
  const headers: Record<string, string> = {
    "x-listening-room": "1",
  };
  if (init?.body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(path, {
    method,
    headers,
    credentials: "same-origin",
    signal: init?.signal,
    referrerPolicy: "same-origin",
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 204 || res.status === 304) return undefined as T;
  try {
    const payload = await res.json();
    if (!res.ok) {
      const body = payload as ErrorBody;
      const code = body.error?.code ?? "VALIDATION";
      const message = body.error?.message ?? "Unexpected error.";
      throw new ApiRequestError(res.status, code, message);
    }
    return payload as T;
  } catch (e) {
    if (e instanceof ApiRequestError) throw e;
    if (!res.ok) throw new ApiRequestError(res.status, "VALIDATION", res.statusText || "Request failed.");
    throw e;
  }
}
