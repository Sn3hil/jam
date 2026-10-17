import type { User } from "@server/db/repos/users";
import type { SessionManager } from "@server/auth/sessions";
import { fail } from "./errors";

export interface Ctx {
  session: SessionManager;
  publicOrigin: string;
  maxBodyBytes: number;
}

export function requireUser(ctx: Ctx, req: Request): User {
  const user = ctx.session.getUser(req);
  if (!user) throw fail(401, "UNAUTHENTICATED", "Sign in to continue.");
  return user;
}

export function assertSameOrigin(ctx: Ctx, req: Request): void {
  const origin = req.headers.get("origin");
  if (origin && origin !== ctx.publicOrigin) {
    throw fail(403, "FORBIDDEN", "Cross-origin requests are not allowed.");
  }
}

export function assertMutationAllowed(ctx: Ctx, req: Request): void {
  assertSameOrigin(ctx, req);
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(declaredLen) || declaredLen <= 0) return;
  const contentType = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    throw fail(400, "VALIDATION", "Content-Type must be application/json.");
  }
}

export async function readJsonBody(ctx: Ctx, req: Request): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > ctx.maxBodyBytes) {
    throw fail(413, "VALIDATION", "Request body is too large.");
  }
  const text = await req.text();
  if (text.length > ctx.maxBodyBytes) {
    throw fail(413, "VALIDATION", "Request body is too large.");
  }
  if (text.length === 0) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw fail(400, "VALIDATION", "Body must be valid JSON.");
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for") ?? "local";
}

export function queryParam(req: Request, name: string): string | null {
  return new URL(req.url).searchParams.get(name);
}
