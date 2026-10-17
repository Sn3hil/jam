import type { QueueItem, UserRef } from "@shared/protocol";

export interface EnqueueCheckContext {
  waitingForUser: number;
  maxQueuePerUser: number;
  duplicate: boolean;
  cooldownActive: boolean;
}

export type EnqueueErrorCode = "QUEUE_FULL" | "DUPLICATE" | "RATE_LIMITED";

export function checkEnqueue(ctx: EnqueueCheckContext): EnqueueErrorCode | null {
  if (ctx.duplicate) return "DUPLICATE";
  if (ctx.waitingForUser >= ctx.maxQueuePerUser) return "QUEUE_FULL";
  if (ctx.cooldownActive) return "RATE_LIMITED";
  return null;
}

export function finalizeEnqueueCheck(
  items: QueueItem[],
  userId: number,
  videoId: string,
  maxQueuePerUser: number,
): EnqueueErrorCode | null {
  const waiting = items.filter((i) => i.requestedBy.id === userId).length;
  if (items.some((i) => i.videoId === videoId)) return "DUPLICATE";
  if (waiting >= maxQueuePerUser) return "QUEUE_FULL";
  return null;
}

export function sortQueueByFifo(items: QueueItem[]): QueueItem[] {
  return [...items].sort((a, b) => a.queuedAt - b.queuedAt);
}

export function refOf(item: QueueItem): UserRef {
  return { id: item.requestedBy.id, displayName: item.requestedBy.displayName };
}
