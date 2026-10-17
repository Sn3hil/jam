import { useEffect, useState } from "react";
import { useRoomStore } from "../state/room";
import { type TokenMap, cssVars, tokensFromSeed } from "./scheme";

export type ThemePreference = "system" | "dark" | "light";

export const THEME_CHANGE_EVENT = "lr:theme-change";
const PREF_KEY = "lr:theme";

export function loadThemePreference(): ThemePreference {
  const raw = localStorage.getItem(PREF_KEY);
  return raw === "dark" || raw === "light" ? raw : "system";
}

export function saveThemePreference(pref: ThemePreference): void {
  localStorage.setItem(PREF_KEY, pref);
  window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function useThemePreference(): ThemePreference {
  const [pref, setPref] = useState(loadThemePreference);
  useEffect(() => {
    const listener = (): void => setPref(loadThemePreference());
    window.addEventListener(THEME_CHANGE_EVENT, listener);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
  }, []);
  return pref;
}

function useSystemDark(): boolean {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState<boolean>(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const listener = (e: MediaQueryListEvent): void => {
      if (loadThemePreference() !== "system") return;
      setDark(e.matches);
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);
  return dark;
}

function setDocColors(tokens: TokenMap, isDark: boolean): void {
  const el = document.documentElement;
  for (const [name, value] of cssVars(tokens)) el.style.setProperty(name, value);
  el.classList.toggle("light", !isDark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", tokens.surface);
}

export function useApplyTheme(): void {
  const seedArgb = useRoomStore((s) => s.state?.nowPlaying?.seedArgb ?? null);
  const pref = useThemePreference();
  const sysDark = useSystemDark();

  useEffect(() => {
    const isDark = pref === "system" ? sysDark : pref === "dark";
    setDocColors(tokensFromSeed(seedArgb, isDark), isDark);
  }, [seedArgb, pref, sysDark]);
}
