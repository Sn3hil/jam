import type { JSX } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { QueueItem, UserDTO } from "@shared/protocol";
import { thumbnailUrl } from "@shared/youtubeUrl";
import { fmtDuration } from "../../lib/format";
import { springs } from "../../theme/motion";
import { Avatar } from "../ui/Avatar";
import { IconButton } from "../ui/Button";

interface QueueListProps {
  me: UserDTO;
  queue: QueueItem[];
  limits: { maxQueuePerUser: number } | null;
  onRemove: (itemId: string) => void;
  removePendingId: string | null;
  className?: string;
}

export function QueueList({
  me,
  queue,
  limits,
  onRemove,
  removePendingId,
  className = "",
}: QueueListProps): JSX.Element {
  const mine = queue.filter((q) => q.requestedBy.id === me.id).length;
  return (
    <div
      className={`rounded-4xl bg-surface-container p-4 border border-outline-variant/30 flex flex-col ${className}`}
    >
      <div className="mb-2 flex items-center justify-between px-2">
        <h3 className="flex items-center gap-2 text-[16px] font-medium">
          <span className="material-symbols-rounded text-[20px] text-primary" aria-hidden>
            queue_music
          </span>
          Queue
        </h3>
        {limits && (
          <span className="text-[12px] text-on-surface-variant">
            {mine} / {limits.maxQueuePerUser} yours
          </span>
        )}
      </div>
      {queue.length === 0 ? (
        <p className="px-3 py-8 text-center text-[14px] text-on-surface-variant my-auto">
          Nothing queued — search above or paste a YouTube link.
        </p>
      ) : (
        <ul className="flex flex-col gap-1 overflow-y-auto max-h-[380px] md:max-h-[440px] pr-1">
          <AnimatePresence initial={false}>
            {queue.map((q, i) => (
              <motion.li
                key={q.itemId}
                layout
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                transition={springs.spatial.default}
                style={{ borderRadius: neighborRadius(i, queue.length) }}
                className={`group flex items-center gap-3 p-2 ${q.requestedBy.id === me.id ? "bg-secondary-container/40" : "bg-surface-container-high/50"}`}
              >
                <img
                  src={thumbnailUrl(q.videoId)}
                  alt=""
                  width={104}
                  height={58}
                  loading="lazy"
                  className="h-14 w-[100px] shrink-0 rounded-xl object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium leading-tight" title={q.title}>
                    {q.title}
                  </p>
                  <p className="mt-0.5 truncate text-[12px] text-on-surface-variant">
                    {q.channel ?? "YouTube"} · {fmtDuration(q.durationSec)}
                    {q.requestedBy.id === me.id ? "" : ""}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <Avatar id={q.requestedBy.id} displayName={q.requestedBy.displayName} size={26} />
                  {q.requestedBy.id === me.id && (
                    <IconButton
                      icon={removePendingId === q.itemId ? "progress_activity" : "close"}
                      label={`Remove ${q.title}`}
                      size="sm"
                      className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
                      onClick={() => onRemove(q.itemId)}
                    />
                  )}
                </span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function neighborRadius(index: number, count: number): string | number {
  if (count === 1) return 20;
  if (index === 0) return "14px 14px 6px 6px";
  if (index === count - 1) return "6px 6px 14px 14px";
  return 6;
}
