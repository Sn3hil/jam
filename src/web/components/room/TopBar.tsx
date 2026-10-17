import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import type { UserDTO } from "@shared/protocol";
import { useRoomStore } from "../../state/room";
import { audioEngine } from "../../audio/audioEngine";
import { ListenersStack } from "../ui/Avatar";
import { useSignOut } from "../../hooks/useSignOut";
import { saveThemePreference, type ThemePreference } from "../../theme/ThemeProvider";

export interface TopBarProps {
  me: UserDTO;
  themePref: ThemePreference;
  onOpenHistory?: () => void;
}

const EMPTY_LISTENERS: { id: number; displayName: string }[] = [];

export function TopBar({ me, themePref, onOpenHistory }: TopBarProps): JSX.Element {
  const listeners = useRoomStore((s) => s.state?.listeners ?? EMPTY_LISTENERS);
  const joined = useRoomStore((s) => s.joined);
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const signOut = useSignOut();

  useEffect(() => {
    const onPointer = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-surface/80 px-4 py-3 backdrop-blur-xl md:px-8 border-b border-outline-variant/20">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-2xl bg-primary-container text-on-primary-container">
          <span className="material-symbols-rounded text-[24px]" aria-hidden>
            graphic_eq
          </span>
        </span>
        <h1 className="text-[17px] font-semibold tracking-tight">Jam</h1>
      </div>
      <div className="flex items-center gap-3">
        <ListenersStack listeners={listeners} />
        {joined ? (
          <button
            type="button"
            onClick={() => audioEngine.leave()}
            className="flex items-center gap-1.5 rounded-full bg-error-container/70 text-on-error-container hover:bg-error-container px-3 py-1.5 text-[12.5px] font-medium transition-all cursor-pointer active:scale-95 border border-error/20"
            title="Leave channel — stop listening"
          >
            <span className="material-symbols-rounded text-[18px]">headset_off</span>
            <span className="hidden sm:inline">Leave</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void audioEngine.join().catch(() => undefined)}
            className="flex items-center gap-1.5 rounded-full bg-primary text-on-primary hover:opacity-90 px-3 py-1.5 text-[12.5px] font-medium transition-all cursor-pointer active:scale-95 shadow-sm"
            title="Join channel — start listening"
          >
            <span className="material-symbols-rounded text-[18px]">headphones</span>
            <span className="hidden sm:inline">Listen</span>
          </button>
        )}
        <div ref={rootRef} className="relative">
          <button
            type="button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="grid size-10 place-items-center rounded-full bg-surface-container-high text-on-surface cursor-pointer hover:bg-surface-container-highest transition-colors"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="material-symbols-rounded" aria-hidden>
              person
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-12 w-64 overflow-hidden rounded-2xl bg-surface-container-high p-1.5 shadow-2xl shadow-black/30 z-50 border border-outline-variant/30"
            >
              <div className="px-3 pb-2 pt-3">
                <p className="text-[15px] font-medium">{me.displayName}</p>
                <p className="text-[12px] text-on-surface-variant">@{me.username}</p>
              </div>
              <div className="my-1 h-px bg-outline-variant/50" />
              <button
                role="menuitem"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onOpenHistory?.();
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] hover:bg-on-surface/8 cursor-pointer transition-colors"
              >
                <span className="material-symbols-rounded text-[20px] text-primary" aria-hidden>
                  history
                </span>
                Listening History
              </button>
              <div className="my-1 h-px bg-outline-variant/50" />
              <p className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-on-surface-variant">
                Theme
              </p>
              {(
                [
                  ["system", "brightness_auto", "System"],
                  ["light", "light_mode", "Light"],
                  ["dark", "dark_mode", "Dark"],
                ] as const
              ).map(([value, icon, label]) => (
                <button
                  key={value}
                  role="menuitem"
                  type="button"
                  onClick={() => {
                    saveThemePreference(value);
                    window.dispatchEvent(new Event("lr:theme-changed"));
                    setMenuOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] ${
                    themePref === value
                      ? "bg-secondary-container text-on-secondary-container"
                      : "hover:bg-on-surface/8"
                  }`}
                >
                  <span className="material-symbols-rounded text-[20px]" aria-hidden>
                    {icon}
                  </span>
                  {label}
                  {themePref === value && (
                    <span className="material-symbols-rounded ml-auto text-[18px]" aria-hidden>
                      check
                    </span>
                  )}
                </button>
              ))}
              <div className="my-1 h-px bg-outline-variant" />
              <button
                role="menuitem"
                type="button"
                onClick={() => signOut.mutate()}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] text-error hover:bg-error-container/40"
              >
                <span className="material-symbols-rounded text-[20px]" aria-hidden>
                  logout
                </span>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
