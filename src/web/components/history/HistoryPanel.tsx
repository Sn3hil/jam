import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX } from "react";
import { useDebounced } from "../../hooks/useDebounced";
import { useHistory } from "../../hooks/useHistory";
import { useQueueActions } from "../../hooks/useQueueActions";
import { fmtDuration, fmtRelative, fmtTimes } from "../../lib/format";
import { pushToast } from "../../state/toasts";
import { thumbnailUrl } from "@shared/youtubeUrl";
import { SegmentedButton, IconButton } from "../ui/Button";
import { LoadingIndicator } from "../ui/Progress";
import { Skeleton } from "../ui/Avatar";
import { TextField } from "../ui/TextField";

export function HistoryPanel(): JSX.Element {
  const [q, setQ] = useState("");
  const dq = useDebounced(q, 250);
  const [view, setView] = useState<"recent" | "top">("recent");
  const pages = useHistory(view, dq);
  const actions = useQueueActions();
  const [requeueId, setRequeueId] = useState<number | null>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);

  const items = useMemo(() => pages.data?.pages.flatMap((p) => p.items) ?? [], [pages.data]);
  const impossible = pages.hasNextPage && pages.isFetchingNextPage;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !pages.hasNextPage) return;
    const ob = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !pages.isFetchingNextPage) void pages.fetchNextPage();
      },
      { rootMargin: "240px" },
    );
    ob.observe(node);
    return () => ob.disconnect();
  }, [pages]);

  const requeue = async (id: number): Promise<void> => {
    const row = items.find((i) => i.id === id);
    if (!row) return;
    setRequeueId(id);
    try {
      const { item } = await actions.enqueueHistory.mutateAsync(id);
      pushToast(`Queued ${row.title}`, "Undo", () => actions.remove.mutate(item.itemId));
    } finally {
      setRequeueId(null);
    }
  };

  return (
    <div className="rounded-4xl bg-surface-container p-3 pb-1 md:p-4 md:pb-2">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
        <h3 className="flex items-center gap-2 text-[16px] font-medium">
          <span className="material-symbols-rounded text-[20px] text-primary" aria-hidden>
            history
          </span>
          History
        </h3>
        <SegmentedButton
          value={view}
          onChange={setView}
          segments={[
            { value: "recent" as const, label: "Recent" },
            { value: "top" as const, label: "Most played" },
          ]}
        />
      </div>
      <div className="px-1 pb-2">
        <TextField
          value={q}
          onChange={setQ}
          placeholder="Search your history…"
          icon="search"
          inputProps={{ inputMode: "search" }}
          className="h-12"
        />
      </div>
      <ul className="flex max-h-[560px] flex-col gap-0.5 overflow-y-auto" aria-live="polite">
        {pages.isLoading &&
          [0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-center gap-3 p-2">
              <Skeleton className="h-[54px] w-24 rounded-lg" />
              <Skeleton className="h-4 w-2/3 rounded" />
            </li>
          ))}
        {items.map((row) => (
          <li
            key={row.id}
            className="group flex items-center gap-1 rounded-xl bg-surface-container-high/50 p-2 hover:bg-surface-container-highest/70"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
              onClick={() => {
                void requeue(row.id);
              }}
            >
              <img
                src={thumbnailUrl(row.videoId)}
                alt=""
                width={96}
                height={54}
                loading="lazy"
                className="h-[54px] w-24 shrink-0 rounded-lg object-cover"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14.5px] font-medium" title={row.title}>
                  {row.title}
                </span>
                <span className="mt-0.5 block truncate text-[12px] text-on-surface-variant">
                  {view === "recent" ? fmtRelative(row.queuedAt) : fmtTimes(row.times ?? 1)} ·{" "}
                  {row.channel ?? "YouTube"} · {fmtDuration(row.durationSec)}
                </span>
              </span>
            </button>
            <IconButton
              icon={requeueId === row.id ? "progress_activity" : "add"}
              label={`Queue again: ${row.title}`}
              size="sm"
              className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
              onClick={() => {
                void requeue(row.id);
              }}
            />
          </li>
        ))}
        {pages.isFetchingNextPage &&
          [0, 1].map((i) => (
            <li key={`f${i}`} className="flex items-center gap-3 p-2">
              <Skeleton className="h-[54px] w-24 rounded-lg" />
              <Skeleton className="h-4 w-1/3 rounded" />
            </li>
          ))}
        <li ref={sentinelRef} className="h-px" />
        {!pages.isLoading && items.length === 0 && (
          <li className="px-3 py-6 text-center text-[13.5px] text-on-surface-variant">Nothing here yet.</li>
        )}
      </ul>
      {impossible && <LoadingIndicator size={20} className="mx-auto my-1" />}
    </div>
  );
}
