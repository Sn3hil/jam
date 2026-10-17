import type { JSX } from "react";
import { useRoomStore } from "../../state/room";

export function JoinGate({ onJoin }: { onJoin?: () => void }): JSX.Element | null {
  const joined = useRoomStore((s) => s.joined);
  if (joined) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-30 grid place-items-end bg-scrim/30 px-4 pb-10">
      <div className="pointer-events-auto mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl bg-surface-container/90 p-6 text-center shadow-2xl shadow-black/40 backdrop-blur-xl">
        <p className="max-w-[40ch] text-[14px] text-on-surface-variant">
          Playback is shared with everyone here. Joining streams the room's audio in this tab.
        </p>
        <button
          type="button"
          onClick={onJoin}
          className="inline-flex h-14 items-center gap-3 rounded-full bg-primary px-8 text-[15px] font-semibold text-on-primary shadow-lg shadow-black/25 transition-transform active:scale-95"
        >
          <span className="material-symbols-rounded text-[24px]" aria-hidden>
            play_arrow
          </span>
          Join the listener
        </button>
        <p className="text-[12px] text-on-surface-variant">no playback starts until you join</p>
      </div>
    </div>
  );
}
