import type { Ctx } from "./middleware";
import type { Broadcaster } from "@server/audio/Broadcaster";

export interface StreamRouteDeps extends Ctx {
  broadcaster: Broadcaster;
  presence: {
    register(userId: number, displayName: string, clientId: number): void;
    unregister(userId: number, clientId: number): void;
  };
}

const listenerCounter = (() => {
  let next = 0;
  return () => ++next;
})();

export function makeStreamRoute(deps: StreamRouteDeps) {
  return (req: Request, server: Bun.Server<string | undefined>): Response => {
    const user = deps.session.getUser(req);
    if (!user) {
      return new Response(
        JSON.stringify({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }),
        {
          status: 401,
          headers: { "content-type": "application/json; charset=utf-8" },
        },
      );
    }
    const listenerId = listenerCounter();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        deps.presence.register(user.id, user.displayName, listenerId);
        deps.broadcaster.addClient({ id: listenerId, userId: user.id }, controller);
      },
      cancel() {
        deps.broadcaster.removeClient(listenerId);
        deps.presence.unregister(user.id, listenerId);
      },
    });
    try {
      server.timeout(req, 0);
    } catch {
      /* older runtime */
    }
    return new Response(body, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store, no-transform",
        "x-accel-buffering": "no",
        connection: "keep-alive",
      },
    });
  };
}
