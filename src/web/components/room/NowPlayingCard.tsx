import { useEffect, useState } from "react";
import type { JSX } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { NowPlaying, UserDTO } from "@shared/protocol";
import { thumbnailUrl } from "@shared/youtubeUrl";
import { useRoomStore } from "../../state/room";
import { fmtDuration } from "../../lib/format";
import { springs } from "../../theme/motion";
import { Button, IconButton } from "../ui/Button";
import { LabelChip } from "../ui/Avatar";
import { WavyProgress } from "../ui/Progress";
import { useUiStore } from "../../state/ui";

function VolumeButton({ className = "" }): JSX.Element {
  const muted = useUiStore((s) => s.muted);
  return (
    <IconButton
      icon={muted ? "volume_off" : "volume_up"}
      label={muted ? "Unmute (local)" : "Mute (local)"}
      className={className}
      onClick={() => useUiStore.getState().setMuted(!muted)}
    />
  );
}

function useExtrapolatedPosition(np: NowPlaying | null, playing: boolean): number {
  const [pos, setPos] = useState(0);
  useEffect(() => {
    if (!np) {
      setPos(0);
      return;
    }
    if (!playing) {
      setPos(np.positionMs);
      return;
    }
    const update = (): void => {
      const st = useRoomStore.getState();
      const serverNow = Date.now() + st.clockOffsetMs;
      const serverTime = st.state?.serverTimeMs ?? serverNow;
      setPos(np.positionMs + Math.max(0, serverNow - serverTime));
    };
    update();
    const t = setInterval(update, 500);
    return () => clearInterval(t);
  }, [np, playing]);
  return pos;
}

export interface NowPlayingCardProps {
  me: UserDTO;
  onRemove: (itemId: string) => void;
  onSkipVote: (vote: boolean) => void;
  removePending: boolean;
  votePending: boolean;
}

export function NowPlayingCard({
  me,
  onRemove,
  onSkipVote,
  removePending,
  votePending,
}: NowPlayingCardProps): JSX.Element {
  const state = useRoomStore((s) => s.state);
  const connection = useRoomStore((s) => s.connection);
  const playing = useRoomStore((s) => s.joined);
  const np = state?.nowPlaying ?? null;
  const status = state?.status ?? "loading";
  const posMs = useExtrapolatedPosition(np, status === "playing" && playing);

  const mine = np !== null && np.requestedBy.id === me.id;
  const voted = np?.skipVoterIds.includes(me.id) ?? false;

  if (np === null) {
    const emptyQueued = state !== null && status === "paused" && state.queue.length > 0;
    return (
      <div className="grid min-h-[380px] place-items-center rounded-4xl bg-surface-container">
        <div className="text-center">
          {status === "loading" ? (
            <>
              <div className="mx-auto mb-4 size-9 motion-safe:animate-spin-slow rounded-full border-[3px] border-primary border-t-transparent" />
              <h2 className="text-[18px] font-medium text-on-surface-variant">Preparing the stream…</h2>
            </>
          ) : emptyQueued ? (
            <>
              <span className="material-symbols-rounded mb-4 text-[56px] text-on-surface-variant" aria-hidden>
                pause_circle
              </span>
              <h2 className="title-lg">Paused — nobody is listening</h2>
              <p className="mt-2 max-w-[30ch] text-[14px] text-on-surface-variant">
                Join to start playback. {state.queue.length > 0 ? "The queue is waiting." : ""}
              </p>
            </>
          ) : (
            <>
              <span className="material-symbols-rounded mb-4 text-[56px] text-on-surface-variant" aria-hidden>
                library_music
              </span>
              <h2 className="title-lg">{playing ? "Nothing is queued" : "The room is quiet"}</h2>
              <p className="mt-2 max-w-[30ch] text-[14px] text-on-surface-variant">
                {playing
                  ? "Search above and queue something"
                  : "Queue something with search or a YouTube link"}
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const durMs = np.durationSec !== null ? np.durationSec * 1000 : null;

  return (
    <div className="overflow-hidden rounded-4xl bg-surface-container">
      <div className="relative">
        <img
          src={thumbnailUrl(np.videoId)}
          alt=""
          className="aspect-video w-full rounded-4xl object-cover"
          width={640}
          height={360}
          loading="eager"
        />
        <div className="absolute right-4 top-4 flex items-center gap-2">
          <LabelChip dotted>LIVE</LabelChip>
        </div>
        <AnimatePresence>
          {voted && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={springs.effects.default}
              className="absolute left-4 top-4"
            >
              <LabelChip tone="error">
                {np.skipVoterIds.length} / {np.votesNeeded} voted to skip
              </LabelChip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-5 pb-5 pt-4 md:px-7 md:pb-7">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="headline-lg truncate" title={np.title}>
              {np.title}
            </h2>
            <p className="mt-1 truncate text-[14px] text-on-surface-variant">
              {np.channel ?? "YouTube"} · queued by{" "}
              <span className="font-medium text-on-surface">{np.requestedBy.displayName}</span>
            </p>
          </div>
          <VolumeButton className="max-md:hidden" />
        </div>

        <div className="mt-4">
          <WavyProgress
            progress={durMs !== null && durMs > 0 ? Math.min(1, posMs / durMs) : 0.25}
            active={status === "playing"}
            totalMs={durMs}
            className="mx-auto max-w-[480px]"
            height={6}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[13px] font-medium text-on-surface-variant">
            {status === "playing" && !playing && (
              <span className="size-2 rounded-full bg-tertiary motion-safe:animate-pulse" />
            )}
            {status === "playing" && !playing ? "Playing — join to hear" : "Playing"}
            <span className="tabular-nums">
              {fmtDuration(Math.min(posMs / 1000, np.durationSec ?? Math.floor(posMs / 1000)))}{" "}
              {durMs !== null && <span className="opacity-60">/ {fmtDuration(np.durationSec)}</span>}
            </span>
          </span>
          <div className="flex items-center gap-2">
            {mine ? (
              <Button
                variant="error"
                size="sm"
                icon="skip_next"
                loading={removePending}
                onClick={() => onRemove(np.itemId)}
              >
                Remove
              </Button>
            ) : (
              <Button
                variant={voted ? "filled" : "tonal"}
                size="sm"
                icon={voted ? "check" : "skip_next"}
                loading={votePending}
                onClick={() => onSkipVote(!voted)}
              >
                {voted ? "Voted " : "Vote skip "}
                {np.skipVoterIds.length} / {np.votesNeeded}
              </Button>
            )}
          </div>
        </div>
        {connection !== "open" && (
          <p className="mt-3 flex items-center gap-2 text-[13px] text-error">
            <span className="material-symbols-rounded text-[18px]" aria-hidden>
              cloud_off
            </span>
            {connection === "connecting" ? "Connecting…" : "Reconnecting to the room…"}
          </p>
        )}
      </div>
    </div>
  );
}
