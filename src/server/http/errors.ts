import type { ErrorCode, ErrorBody } from "@shared/protocol";
import type { Server } from "bun";
import { ZodError } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly extraHeaders?: Record<string, string>;

  constructor(status: number, code: ErrorCode, message: string, extraHeaders?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.extraHeaders = extraHeaders;
  }
}

export function fail(
  status: number,
  code: ErrorCode,
  message: string,
  extraHeaders?: Record<string, string>,
): ApiError {
  return new ApiError(status, code, message, extraHeaders);
}

export function failValidation(error: ZodError): ApiError {
  const issue = error.issues[0];
  const detail = issue ? `${issue.path.join(".")} ${issue.message}`.trim() : "invalid input";
  return fail(400, "VALIDATION", detail);
}

export function json(status: number, payload: unknown, extraHeaders?: Record<string, string>): Response {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  if (extraHeaders) for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  return new Response(JSON.stringify(payload), { status, headers });
}

export function noContent(extraHeaders?: Record<string, string>): Response {
  const headers = new Headers(extraHeaders);
  return new Response(null, { status: 204, headers });
}

export { RoomError } from "@server/room/Room";
import { RoomError } from "@server/room/Room";
import { STATUS_CODE_BY_ERROR } from "@shared/protocol";

export function toApiError(error: unknown): unknown {
  if (error instanceof RoomError) {
    const code = error.code;
    return fail(STATUS_CODE_BY_ERROR[code] ?? 400, code, error.message);
  }
  return error;
}

export function errorResponse(error: unknown): Response {
  const mapped = toApiError(error);
  if (mapped instanceof ApiError) {
    const headers = new Headers(mapped.extraHeaders);
    headers.set("content-type", "application/json; charset=utf-8");
    const body: ErrorBody = { error: { code: mapped.code, message: mapped.message } };
    return new Response(JSON.stringify(body), { status: mapped.status, headers });
  }
  if (error instanceof ApiError) {
    const headers = new Headers(error.extraHeaders);
    headers.set("content-type", "application/json; charset=utf-8");
    const body: ErrorBody = { error: { code: error.code, message: error.message } };
    return new Response(JSON.stringify(body), { status: error.status, headers });
  }
  if (error instanceof ZodError) {
    const validation = failValidation(error);
    const headers = new Headers();
    headers.set("content-type", "application/json; charset=utf-8");
    const body: ErrorBody = { error: { code: validation.code, message: validation.message } };
    return new Response(JSON.stringify(body), { status: validation.status, headers });
  }
  console.error("unhandled route error:", error);
  return json(500, { error: { code: "VALIDATION", message: "Unexpected server error." } });
}

export function handle(handler: (req: Request, server: Server<unknown>) => Promise<Response> | Response) {
  return async (req: Request, server: Server<unknown>): Promise<Response> => {
    try {
      return await handler(req, server);
    } catch (error) {
      return errorResponse(error);
    }
  };
}
