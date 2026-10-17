import { fail } from "./errors";
import { isVideoId } from "@shared/youtubeUrl";

export function pathAfter(req: Request, prefix: string): string {
  const url = new URL(req.url);
  let pathname = url.pathname;
  if (pathname.startsWith(prefix)) {
    pathname = pathname.slice(prefix.length);
    const end = pathname.indexOf("/");
    return end === -1 ? pathname : pathname.slice(0, end);
  }
  return pathname.replace(/\/+$/, "");
}

export function resolveVideoIdFromPath(req: Request, prefix: string): string {
  const raw = pathAfter(req, prefix);
  const id = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();
  if (!isVideoId(id)) throw fail(404, "NOT_FOUND", "Video id must be exactly 11 characters.");
  return id;
}
