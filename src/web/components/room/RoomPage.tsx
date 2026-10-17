import { useMemo, useState } from "react";
import type { JSX } from "react";
import { useLocation } from "wouter";
import type { UserDTO } from "@shared/protocol";
import { useRoomStore } from "../../state/room";
import { audioEngine } from "../../audio/audioEngine";
import { loadThemePreference, saveThemePreference, useThemePreference } from "../../theme/ThemeProvider";
import { TopBar } from "./TopBar";
import { VinylRecordCard } from "./VinylRecordCard";
import { NowPlayingMetadataBar } from "./NowPlayingMetadataBar";
import { QueueList } from "./QueueList";
import { SearchPanel } from "../search/SearchPanel";
import { HistoryPanel } from "../history/HistoryPanel";
import { JoinGate } from "./JoinGate";
import { Avatar, ListenersStack } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { useQueueActions } from "../../hooks/useQueueActions";
import { useSignOut } from "../../hooks/useSignOut";

interface RoomPageProps {
  me: UserDTO;
}

type MobileTab = "player" | "queue" | "history" | "profile";

export function RoomPage({ me }: RoomPageProps): JSX.Element {
  const [, setLocation] = useLocation();
  const [mobileTab, setMobileTab] = useState<MobileTab>("player");

  const state = useRoomStore((s) => s.state);
  const actions = useQueueActions();

  const slots = useMemo(() => {
    if (!state) return null;
    const mine = state.queue.filter((i) => i.requestedBy.id === me.id).length;
    const np = state.nowPlaying;
    const mineNow = np !== null && np.requestedBy.id === me.id ? 1 : 0;
    return Math.max(0, state.limits.maxQueuePerUser - mine - mineNow);
  }, [state, me.id]);

  const join = (): void => {
    void audioEngine.join().catch(() => undefined);
  };

  return (
    <div className="relative min-h-dvh bg-surface text-on-surface">
      <TopBar me={me} themePref={loadThemePreference()} onOpenHistory={() => setLocation("/history")} />

      {/* Desktop Layout (Image 2) */}
      <div className="hidden md:flex flex-col gap-5 mx-auto max-w-7xl px-4 py-4 md:px-8">
        {/* Top Search Bar */}
        <div className="w-full max-w-2xl mx-auto">
          <SearchPanel
            onEnqueueVideo={(videoId) => actions.enqueueVideo.mutate(videoId)}
            onEnqueueUrl={(url) => actions.enqueueUrl.mutate(url)}
            enqueuePending={actions.enqueueVideo.isPending || actions.enqueueUrl.isPending}
            slotsUsed={slots}
          />
        </div>

        {/* Middle Row: Left Spinning Artwork Record, Right Queue */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-5 items-stretch">
          <VinylRecordCard className="h-full" />
          <QueueList
            me={me}
            queue={state?.queue ?? []}
            limits={state ? { maxQueuePerUser: state.limits.maxQueuePerUser } : null}
            onRemove={(itemId) => actions.remove.mutate(itemId)}
            removePendingId={actions.remove.variables ?? null}
            className="h-full"
          />
        </div>

        {/* Bottom Row: Metadata and Progress Bar */}
        <NowPlayingMetadataBar
          me={me}
          onRemove={(itemId) => actions.remove.mutate(itemId)}
          onSkipVote={(vote) => actions.skipVote.mutate(vote)}
          onTogglePlayback={(paused) => actions.setPlaybackPaused.mutate(paused)}
          playbackPending={actions.setPlaybackPaused.isPending}
          removePending={actions.remove.isPending}
          votePending={actions.skipVote.isPending}
        />
      </div>

      {/* Mobile Layout (Image 3) */}
      <div className="md:hidden flex flex-col gap-4 px-4 pb-28 pt-2">
        {/* Search Bar at top for Player and Queue tabs */}
        {(mobileTab === "player" || mobileTab === "queue") && (
          <SearchPanel
            onEnqueueVideo={(videoId) => {
              actions.enqueueVideo.mutate(videoId);
              setMobileTab("player");
            }}
            onEnqueueUrl={(url) => {
              actions.enqueueUrl.mutate(url);
              setMobileTab("player");
            }}
            enqueuePending={actions.enqueueVideo.isPending || actions.enqueueUrl.isPending}
            slotsUsed={slots}
          />
        )}

        {mobileTab === "player" && (
          <div className="flex flex-col gap-4">
            {/* Spinning Artwork Record */}
            <VinylRecordCard />
            {/* Metadata and Progress Bar */}
            <NowPlayingMetadataBar
              me={me}
              onRemove={(itemId) => actions.remove.mutate(itemId)}
              onSkipVote={(vote) => actions.skipVote.mutate(vote)}
              onTogglePlayback={(paused) => actions.setPlaybackPaused.mutate(paused)}
              playbackPending={actions.setPlaybackPaused.isPending}
              removePending={actions.remove.isPending}
              votePending={actions.skipVote.isPending}
            />
          </div>
        )}

        {mobileTab === "queue" && (
          <QueueList
            me={me}
            queue={state?.queue ?? []}
            limits={state ? { maxQueuePerUser: state.limits.maxQueuePerUser } : null}
            onRemove={(itemId) => actions.remove.mutate(itemId)}
            removePendingId={actions.remove.variables ?? null}
          />
        )}

        {mobileTab === "history" && (
          <div className="pt-1">
            <HistoryPanel />
          </div>
        )}

        {mobileTab === "profile" && <MobileProfilePanel me={me} />}
      </div>

      {/* Mobile Navigation Bar (Image 3) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 z-30 md:hidden bg-surface-container-high/95 backdrop-blur-xl border-t border-outline-variant/30 px-3 py-2 flex items-center justify-around shadow-2xl"
      >
        {[
          { id: "player" as const, icon: "album", label: "Player" },
          { id: "queue" as const, icon: "queue_music", label: "Queue" },
          { id: "history" as const, icon: "history", label: "History" },
          { id: "profile" as const, icon: "person", label: "Profile" },
        ].map((tab) => {
          const active = mobileTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMobileTab(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 py-0.5 px-3 transition-colors cursor-pointer ${
                active ? "text-primary font-semibold" : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <span
                className={`grid place-items-center rounded-full px-4 py-1 transition-all ${
                  active
                    ? "bg-primary-container text-on-primary-container scale-105"
                    : "hover:bg-on-surface/5"
                }`}
              >
                <span className="material-symbols-rounded text-[22px] leading-none">{tab.icon}</span>
              </span>
              <span className="text-[11px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <JoinGate onJoin={join} />
    </div>
  );
}

function MobileProfilePanel({ me }: { me: UserDTO }): JSX.Element {
  const listeners = useRoomStore((s) => s.state?.listeners ?? []);
  const joined = useRoomStore((s) => s.joined);
  const themePref = useThemePreference();
  const signOut = useSignOut();

  return (
    <div className="flex flex-col gap-4 rounded-4xl bg-surface-container p-5 border border-outline-variant/30">
      {/* Account Info */}
      <div className="flex items-center gap-3">
        <Avatar id={me.id} displayName={me.displayName} size={48} />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold text-on-surface truncate">{me.displayName}</p>
          <p className="text-[13px] text-on-surface-variant truncate">@{me.username}</p>
        </div>
      </div>

      <div className="h-px bg-outline-variant/40" />

      {/* Theme Picker */}
      <div>
        <p className="pb-2 text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">
          Appearance Theme
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["system", "brightness_auto", "System"],
              ["light", "light_mode", "Light"],
              ["dark", "dark_mode", "Dark"],
            ] as const
          ).map(([value, icon, label]) => {
            const active = themePref === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => {
                  saveThemePreference(value);
                  window.dispatchEvent(new Event("lr:theme-changed"));
                }}
                className={`flex flex-col items-center gap-1.5 rounded-2xl p-2.5 text-center text-[12px] font-medium transition-all cursor-pointer ${
                  active
                    ? "bg-primary-container text-on-primary-container shadow-sm"
                    : "bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest"
                }`}
              >
                <span className="material-symbols-rounded text-[20px]">{icon}</span>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-px bg-outline-variant/40" />

      {/* Listeners in Room */}
      <div>
        <div className="flex items-center justify-between pb-2">
          <p className="text-[12px] font-semibold uppercase tracking-wider text-on-surface-variant">
            Listening Now ({listeners.length})
          </p>
          <ListenersStack listeners={listeners} max={4} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          {listeners.map((l) => (
            <span
              key={l.id}
              className="inline-flex items-center gap-2 rounded-full bg-surface-container-high px-3 py-1 text-[12px] text-on-surface"
            >
              <Avatar id={l.id} displayName={l.displayName} size={20} />
              {l.displayName}
            </span>
          ))}
        </div>
      </div>

      <div className="h-px bg-outline-variant/40" />

      {/* Leave Channel button if currently listening */}
      {joined && (
        <>
          <Button
            variant="tonal"
            icon="headset_off"
            onClick={() => audioEngine.leave()}
            className="w-full justify-center text-error hover:bg-error-container/40"
          >
            Leave Channel
          </Button>
          <div className="h-px bg-outline-variant/40" />
        </>
      )}

      {/* Sign Out Button */}
      <Button
        variant="error"
        icon="logout"
        onClick={() => signOut.mutate()}
        className="w-full justify-center"
      >
        Sign out
      </Button>
    </div>
  );
}
