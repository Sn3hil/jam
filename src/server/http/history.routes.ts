import { z } from "zod";
import type { HistoryItem } from "@shared/protocol";
import { json, handle, fail } from "./errors";
import { requireUser, type Ctx } from "./middleware";

const historySchema = z.object({
  view: z.enum(["recent", "top"]).default("recent"),
  q: z.string().max(100).default(""),
  cursor: z.string().max(16).optional(),
  limit: z.coerce.number().int().min(1).max(30).default(30),
});

export interface HistoryRouteDeps extends Ctx {
  listRecent(
    userId: number,
    term: string | null,
    cursorId: number | null,
    limit: number,
  ): Array<Omit<HistoryItem, "times">>;
  listTop(userId: number, term: string | null, limit: number, offset: number): Array<HistoryItem>;
  countRecent(userId: number, term: string | null): number;
}

export function makeHistoryRoutes(deps: HistoryRouteDeps) {
  const get = handle(async (req) => {
    const user = requireUser(deps, req);
    const url = new URL(req.url);
    const raw = {
      view: url.searchParams.get("view") ?? "recent",
      q: (url.searchParams.get("q") ?? "").slice(0, 100),
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? "30",
    };
    const parsed = historySchema.safeParse(raw);
    if (!parsed.success) {
      throw fail(400, "VALIDATION", "Bad history query.");
    }
    const term = parsed.data.q.trim().length > 0 ? parsed.data.q.trim() : null;
    if (parsed.data.view === "recent") {
      const cursor = parsed.data.cursor !== undefined ? Number.parseInt(parsed.data.cursor, 10) : null;
      if (cursor !== null && !Number.isFinite(cursor)) throw fail(400, "VALIDATION", "Bad cursor.");
      const rows = deps.listRecent(user.id, term, cursor, parsed.data.limit + 1);
      const hasMore = rows.length > parsed.data.limit;
      const items = hasMore ? rows.slice(0, parsed.data.limit) : rows;
      const nextCursor = hasMore ? String(items[items.length - 1]?.id ?? 0) : null;
      return json(200, { items, nextCursor });
    }
    const offset = parsed.data.cursor !== undefined ? Number.parseInt(parsed.data.cursor, 10) : 0;
    if (!Number.isFinite(offset)) throw fail(400, "VALIDATION", "Bad cursor.");
    const rows = deps.listTop(user.id, term, parsed.data.limit + 1, offset);
    const hasMore = rows.length > parsed.data.limit;
    const items = hasMore ? rows.slice(0, parsed.data.limit) : rows;
    const nextCursor = hasMore ? String(offset + parsed.data.limit) : null;
    return json(200, { items, nextCursor });
  });

  return {
    "/api/history": { GET: get },
  };
}
