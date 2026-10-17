import type { Database } from "bun:sqlite";

export interface HistoryRow {
  id: number;
  userId: number;
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  seedArgb: number | null;
  queuedAt: number;
}

export interface HistoryInput {
  userId: number;
  videoId: string;
  title: string;
  channel: string | null;
  durationSec: number | null;
  seedArgb: number | null;
}

interface HistoryRowDb {
  id: number;
  user_id: number;
  video_id: string;
  title: string;
  channel: string | null;
  duration_sec: number | null;
  seed_argb: number | null;
  queued_at: number;
}

function toRow(r: HistoryRowDb): HistoryRow {
  return {
    id: r.id,
    userId: r.user_id,
    videoId: r.video_id,
    title: r.title,
    channel: r.channel,
    durationSec: r.duration_sec,
    seedArgb: r.seed_argb,
    queuedAt: r.queued_at,
  };
}

export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export function makeHistoryRepo(db: Database) {
  const insert = db.query<
    HistoryRowDb,
    [number, string, string, string | null, number | null, number | null]
  >(
    "INSERT INTO queued_songs (user_id, video_id, title, channel, duration_sec, seed_argb) VALUES (?, ?, ?, ?, ?, ?) RETURNING *",
  );
  const byIdAndUser = db.query<HistoryRowDb, [number, number]>(
    "SELECT id, user_id, video_id, title, channel, duration_sec, seed_argb, queued_at FROM queued_songs WHERE id = ? AND user_id = ?",
  );
  const recent = db.query<HistoryRowDb, [number, string | null, number | null, number]>(
    `SELECT id, user_id, video_id, title, channel, duration_sec, seed_argb, queued_at
     FROM queued_songs
     WHERE user_id = ?1
       AND (?2 IS NULL OR title LIKE '%' || ?2 || '%' ESCAPE '\\' OR channel LIKE '%' || ?2 || '%' ESCAPE '\\')
       AND (?3 IS NULL OR id < ?3)
     ORDER BY id DESC
     LIMIT ?4`,
  );
  const recentCount = db.query<{ n: number }, [number, string | null]>(
    `SELECT COUNT(*) AS n
     FROM queued_songs
     WHERE user_id = ?1
       AND (?2 IS NULL OR title LIKE '%' || ?2 || '%' ESCAPE '\\' OR channel LIKE '%' || ?2 || '%' ESCAPE '\\')`,
  );
  const top = db.query<
    {
      id: number;
      user_id: number;
      video_id: string;
      title: string;
      channel: string | null;
      duration_sec: number | null;
      seed_argb: number | null;
      queued_at: number;
      times: number;
    },
    [number, string | null, number, number]
  >(
    `SELECT g.id, g.user_id, g.video_id, g.title, g.channel, g.duration_sec, g.seed_argb, g.queued_at, m.times
     FROM queued_songs g
     JOIN (
       SELECT video_id, MAX(id) AS latest_id, COUNT(*) AS times
       FROM queued_songs
       WHERE user_id = ?1 AND (?2 IS NULL OR title LIKE '%' || ?2 || '%' ESCAPE '\\' OR channel LIKE '%' || ?2 || '%' ESCAPE '\\')
       GROUP BY video_id
     ) m ON m.video_id = g.video_id AND m.latest_id = g.id
     ORDER BY m.times DESC, g.id DESC
     LIMIT ?3 OFFSET ?4`,
  );
  const deleteByIdAndUser = db.query<void, [number, number]>(
    "DELETE FROM queued_songs WHERE id = ? AND user_id = ?",
  );

  return {
    append(input: HistoryInput): HistoryRow {
      const row = insert.get(
        input.userId,
        input.videoId,
        input.title,
        input.channel,
        input.durationSec,
        input.seedArgb,
      );
      if (!row) throw new Error("insert history failed");
      return toRow(row);
    },
    getOwn(id: number, userId: number): HistoryRow | null {
      const row = byIdAndUser.get(id, userId);
      return row ? toRow(row) : null;
    },
    listRecent(userId: number, term: string | null, cursorId: number | null, limit: number): HistoryRow[] {
      return recent.all(userId, term, cursorId, limit).map(toRow);
    },
    countRecent(userId: number, term: string | null): number {
      return recentCount.get(userId, term)?.n ?? 0;
    },
    listTop(
      userId: number,
      term: string | null,
      limit: number,
      offset: number,
    ): (HistoryRow & { times: number })[] {
      return top.all(userId, term, limit, offset).map((r) => ({ ...toRow(r), times: r.times }));
    },
    deleteOwn(id: number, userId: number): boolean {
      const result = deleteByIdAndUser.run(id, userId);
      return result.changes > 0;
    },
  };
}

export type HistoryRepo = ReturnType<typeof makeHistoryRepo>;
