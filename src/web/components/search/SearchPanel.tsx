import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX, KeyboardEvent } from "react";
import type { SearchResult, VideoInfo } from "@shared/protocol";
import { parseYouTubeInput, watchUrl, thumbnailUrl } from "@shared/youtubeUrl";
import { apiFetch } from "../../api";
import { fmtDuration } from "../../lib/format";
import { TextField } from "../ui/TextField";
import { IconButton } from "../ui/Button";
import { LoadingIndicator } from "../ui/Progress";

interface SearchPanelProps {
  onEnqueueVideo: (videoId: string) => void;
  onEnqueueUrl: (url: string) => void;
  enqueuePending: boolean;
  slotsUsed: number | null;
  className?: string;
}

const DEBOUNCE_MS = 350;

type Lookup =
  | { kind: "loading" }
  | { kind: "video"; info: VideoInfo }
  | { kind: "error"; message: string }
  | null;

export function SearchPanel({
  onEnqueueVideo,
  onEnqueueUrl,
  enqueuePending,
  slotsUsed,
  className = "",
}: SearchPanelProps): JSX.Element {
  const [raw, setRaw] = useState("");
  const [linkPending, setLinkPending] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookup, setLookup] = useState<Lookup>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => parseYouTubeInput(raw), [raw]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = raw.trim();
      if (parsed.kind === "video") {
        setQuery("");
        setLinkPending(true);
        apiFetch<VideoInfo>(`/api/video/${parsed.videoId}`)
          .then((info) => setLookup({ kind: "video", info }))
          .catch(() => setLookup({ kind: "error", message: "That link didn't resolve — check it." }))
          .finally(() => setLinkPending(false));
      } else {
        setLookup(null);
        setQuery(trimmed);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [raw, parsed]);

  useEffect(() => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    let alive = true;
    setLoading(true);
    apiFetch<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(query)}`)
      .then((body) => {
        if (alive) setResults(body.results);
      })
      .catch(() => {
        if (alive) setResults((prev) => prev ?? []);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query]);

  useEffect(() => {
    const onPointer = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset highlight when query or lookup changes (intentional state reset)
  useEffect(() => {
    setHi(0);
  }, [query, lookup?.kind]);

  const linkPreviewOpen = open && lookup?.kind === "video";
  const resultsOpen = open && query.trim().length > 0 && !linkPreviewOpen;
  const highlightId =
    (results !== null && hi >= 0 && hi < results.length ? results[hi]?.videoId : undefined) ?? undefined;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <TextField
        value={raw}
        onChange={(v) => {
          setRaw(v);
          setOpen(true);
        }}
        placeholder="Search or paste a YouTube link…"
        icon="search"
        inputProps={
          {
            role: "combobox",
            "aria-expanded": resultsOpen || linkPreviewOpen,
            autoComplete: "off",
          } as React.InputHTMLAttributes<HTMLInputElement>
        }
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === "ArrowDown" && results) {
            e.preventDefault();
            setOpen(true);
            setHi(Math.min(results.length - 1, hi + 1));
          } else if (e.key === "ArrowUp" && results) {
            e.preventDefault();
            setHi(Math.max(0, hi - 1));
          } else if (e.key === "Escape") {
            setOpen(false);
          } else if (e.key === "Enter" && open) {
            e.preventDefault();
            if (lookup?.kind === "video") {
              onEnqueueUrl(watchUrl(lookup.info.videoId));
              setRaw("");
              setOpen(false);
            } else if (linkPending) {
              return;
            } else if (parsed.kind === "invalid" && /^https?:\/\//i.test(raw.trim())) {
              onEnqueueUrl(raw.trim());
              setRaw("");
            } else if (results?.[hi]) {
              onEnqueueVideo(results[hi]?.videoId ?? "");
              setRaw("");
              setOpen(false);
            }
          } else if (e.key === "Enter" && !open) {
            setOpen(true);
          }
        }}
      />
      {slotsUsed !== null && (
        <p className="mt-1 px-4 text-[11px] text-on-surface-variant">
          {slotsUsed} of {5} slots free
        </p>
      )}
      {resultsOpen && results !== null && results.length === 0 && !loading && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-40 rounded-2xl bg-surface-container px-4 py-3 text-[14px] text-on-surface-variant shadow-2xl shadow-black/30">
          No results for “{query}”.
        </div>
      )}
      {resultsOpen && highlightId !== undefined && hi >= 0 && results && (
        <ResultsList
          hi={hi}
          setHi={setHi}
          onPick={(videoId) => {
            onEnqueueVideo(videoId);
            setRaw("");
            setOpen(false);
          }}
          results={results}
          loading={loading}
        />
      )}
      {resultsOpen && results === null && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-40 rounded-2xl bg-surface-container p-4 shadow-2xl shadow-black/30">
          <LoadingIndicator size={22} />
        </div>
      )}
      {linkPreviewOpen && lookup.kind === "video" && (
        <LinkPreview
          info={lookup.info}
          onAdd={() => {
            onEnqueueUrl(watchUrl(lookup.info.videoId));
            setRaw("");
            setOpen(false);
          }}
          pending={enqueuePending}
        />
      )}
      {open && lookup?.kind === "error" && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-40 rounded-xl bg-error-container/60 px-4 py-2 text-[13px] text-on-error-container shadow-xl shadow-black/20">
          {lookup.message}
        </div>
      )}
    </div>
  );
}

interface ResultsListProps {
  results: SearchResult[];
  hi: number;
  setHi: (n: number) => void;
  onPick: (videoId: string) => void;
  loading: boolean;
}

function ResultsList({ results, hi, setHi, onPick, loading }: ResultsListProps): JSX.Element {
  return (
    <ul
      id="search-results"
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA combobox listbox semantics
      role="listbox"
      className="absolute inset-x-0 top-[calc(100%+4px)] z-40 max-h-[420px] overflow-y-auto rounded-2xl bg-surface-container p-1.5 shadow-2xl shadow-black/30"
    >
      {results.map((r, i) => (
        <li
          key={r.videoId}
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA combobox listbox option semantics
          role="option"
          aria-selected={i === hi}
          tabIndex={0}
          onMouseEnter={() => setHi(i)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPick(r.videoId);
            }
          }}
          className={`flex cursor-pointer items-center gap-3 rounded-xl p-1.5 ${i === hi ? "bg-secondary-container/70" : ""}`}
          onClick={() => onPick(r.videoId)}
        >
          <img
            src={thumbnailUrl(r.videoId)}
            alt=""
            width={96}
            height={54}
            loading="lazy"
            className="h-[54px] w-24 shrink-0 rounded-lg object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium" title={r.title}>
              {r.title}
            </p>
            <p className="mt-0.5 truncate text-[12px] text-on-surface-variant">
              {r.channel ?? "YouTube"} · {fmtDuration(r.durationSec)}
            </p>
          </div>
          <IconButton
            icon={loading ? "progress_activity" : "add"}
            label={`Queue ${r.title}`}
            size="sm"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              onPick(r.videoId);
            }}
          />
        </li>
      ))}
    </ul>
  );
}

interface LinkPreviewProps {
  info: VideoInfo;
  onAdd: () => void;
  pending: boolean;
}

function LinkPreview({ info, onAdd, pending }: LinkPreviewProps): JSX.Element {
  return (
    <div className="absolute inset-x-0 top-[calc(100%+4px)] z-40 flex items-center gap-3 rounded-2xl bg-surface-container p-2 shadow-2xl shadow-black/30">
      <img
        src={thumbnailUrl(info.videoId)}
        alt=""
        width={112}
        height={63}
        className="h-16 w-28 shrink-0 rounded-xl object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{info.title}</p>
        <p className="truncate text-[12px] text-on-surface-variant">
          {info.channel ?? "YouTube"} · {info.isLive ? "LIVE" : fmtDuration(info.durationSec)}
        </p>
      </div>
      <IconButton
        icon={pending ? "progress_activity" : "add"}
        label={`Queue ${info.title}`}
        onClick={onAdd}
      />
    </div>
  );
}
