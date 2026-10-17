import { useEffect, useState } from "react";
import type { JSX } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { NowPlaying, UserDTO } from "@shared/protocol";
import { useRoomStore } from "../../state/room";
import { audioEngine } from "../../audio/audioEngine";
import { fmtDuration } from "../../lib/format";
import { springs } from "../../theme/motion";
import { Button } from "../ui/Button";
import { LabelChip } from "../ui/Avatar";
import { WavyProgress } from "../ui/Progress";
import { VolumeControl } from "../ui/VolumeControl";

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

export interface NowPlayingMetadataBarProps {
  me: UserDTO;
  onRemove: (itemId: string) => void;
  onSkipVote: (vote: boolean) => void;
  onTogglePlayback?: (paused: boolean) => void;
  playbackPending?: boolean;
  removePending: boolean;
  votePending: boolean;
  className?: string;
}

export function NowPlayingMetadataBar({
  me,
  onRemove,
  onSkipVote,
  onTogglePlayback,
  playbackPending = false,
  removePending,
  votePending,
  className = "",
}: NowPlayingMetadataBarProps): JSX.Element {
  const state = useRoomStore((s) => s.state);
  const connection = useRoomStore((s) => s.connection);
  const playing = useRoomStore((s) => s.joined);
  const np = state?.nowPlaying ?? null;
  const status = state?.status ?? "loading";
  const posMs = useExtrapolatedPosition(np, status === "playing" && playing);

  const mine = np !== null && np.requestedBy.id === me.id;
  const voted = np?.skipVoterIds.includes(me.id) ?? false;
  const isRoomPaused = status === "paused";

  if (np === null) {
    const emptyQueued = state !== null && status === "paused" && state.queue.length > 0;
    return (
      <div
        className={`rounded-4xl bg-surface-container p-4 md:p-6 border border-outline-variant/30 ${className}`}
      >
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-full ${
                playing
                  ? "bg-primary-container text-on-primary-container"
                  : "bg-surface-container-high text-on-surface-variant"
              }`}
            >
              <span className="material-symbols-rounded text-[24px]">
                {playing ? "graphic_eq" : "music_note"}
              </span>
            </span>
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold text-on-surface truncate">
                {status === "loading"
                  ? "Preparing the stream…"
                  : emptyQueued
                    ? "Paused — nobody is listening"
                    : playing
                      ? "Listening to Jam"
                      : "The room is quiet"}
              </h3>
              <p className="text-[12px] text-on-surface-variant truncate">
                {emptyQueued
                  ? "Queue ready — queue something to play"
                  : playing
                    ? "Queue a track with search above"
                    : "Click Listen to join the channel"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 ml-auto flex-wrap sm:flex-nowrap">
            {playing ? (
              <Button
                variant="tonal"
                size="sm"
                icon="headset_off"
                onClick={() => audioEngine.leave()}
                className="text-error hover:bg-error-container/40"
              >
                Leave
              </Button>
            ) : (
              <Button
                variant="filled"
                size="sm"
                icon="headphones"
                onClick={() => void audioEngine.join().catch(() => undefined)}
              >
                Listen
              </Button>
            )}
            <VolumeControl />
          </div>
        </div>
      </div>
    );
  }

  const durMs = np.durationSec !== null ? np.durationSec * 1000 : null;

  return (
    <div
      className={`rounded-4xl bg-surface-container p-4 md:p-6 border border-outline-variant/30 shadow-lg ${className}`}
    >
      {/* Title & Metadata row (LIVE element removed) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="headline-lg truncate font-semibold text-on-surface" title={np.title}>
            {np.title}
          </h2>
          <p className="mt-1 truncate text-[13.5px] text-on-surface-variant">
            {np.channel ?? "YouTube"} · queued by{" "}
            <span className="font-medium text-on-surface">{np.requestedBy.displayName}</span>
          </p>
        </div>

        <AnimatePresence>
          {voted && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={springs.effects.default}
            >
              <LabelChip tone="error">
                {np.skipVoterIds.length} / {np.votesNeeded} voted to skip
              </LabelChip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Smooth Wavy Progress Bar */}
      <div className="mt-4">
        <WavyProgress
          progress={durMs !== null && durMs > 0 ? Math.min(1, posMs / durMs) : 0.25}
          active={status === "playing" && playing}
          totalMs={durMs}
          height={5}
        />
      </div>

      {/* Controls & Volume bar with Play/Pause button (requester only) and Leave button */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-outline-variant/20">
        {/* Play/Pause button (ONLY FOR REQUESTER) + Playback time & status */}
        <div className="flex items-center gap-3">
          {mine ? (
            <button
              type="button"
              aria-label={isRoomPaused ? "Resume song room-wide" : "Pause song room-wide"}
              title={isRoomPaused ? "Resume song room-wide" : "Pause song room-wide"}
              onClick={() => onTogglePlayback?.(!isRoomPaused)}
              disabled={playbackPending}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-on-primary shadow-sm hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-rounded text-[24px] filled">
                {isRoomPaused ? "play_arrow" : "pause"}
              </span>
            </button>
          ) : isRoomPaused ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-highest px-3 py-1 text-[12px] font-medium text-on-surface-variant">
              <span className="material-symbols-rounded text-[16px] text-tertiary">pause_circle</span>
              Paused by requester
            </span>
          ) : null}

          <span className="text-[13px] font-medium text-on-surface-variant tabular-nums">
            {fmtDuration(Math.min(posMs / 1000, np.durationSec ?? Math.floor(posMs / 1000)))}{" "}
            {durMs !== null && <span className="opacity-60">/ {fmtDuration(np.durationSec)}</span>}
          </span>
        </div>

        {/* Action buttons, Leave channel button & Volume slider */}
        <div className="flex items-center gap-3 ml-auto flex-wrap sm:flex-nowrap">
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

          {/* Dedicated Leave / Listen button to stop/start listening in the channel */}
          {playing ? (
            <Button
              variant="tonal"
              size="sm"
              icon="headset_off"
              onClick={() => audioEngine.leave()}
              title="Leave channel — stop listening"
              className="text-error hover:bg-error-container/40"
            >
              Leave
            </Button>
          ) : (
            <Button
              variant="filled"
              size="sm"
              icon="headphones"
              onClick={() => void audioEngine.join().catch(() => undefined)}
              title="Join channel — start listening"
            >
              Listen
            </Button>
          )}

          {/* Volume Control with slider */}
          <VolumeControl />
        </div>
      </div>

      {connection !== "open" && (
        <p className="mt-2.5 flex items-center gap-2 text-[12.5px] text-error">
          <span className="material-symbols-rounded text-[18px]" aria-hidden>
            cloud_off
          </span>
          {connection === "connecting" ? "Connecting…" : "Reconnecting to the room…"}
        </p>
      )}
    </div>
  );
}
