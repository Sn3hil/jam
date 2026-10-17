import {
  Hct,
  MaterialDynamicColors,
  SchemeExpressive,
  hexFromArgb,
} from "@material/material-color-utilities";

export const DEFAULT_SEED = 0xff415c84;

const ROLES = [
  "primary",
  "onPrimary",
  "primaryContainer",
  "onPrimaryContainer",
  "secondary",
  "onSecondary",
  "secondaryContainer",
  "onSecondaryContainer",
  "tertiary",
  "onTertiary",
  "tertiaryContainer",
  "onTertiaryContainer",
  "error",
  "onError",
  "errorContainer",
  "onErrorContainer",
  "surface",
  "onSurface",
  "onSurfaceVariant",
  "surfaceContainerLowest",
  "surfaceContainerLow",
  "surfaceContainer",
  "surfaceContainerHigh",
  "surfaceContainerHighest",
  "surfaceDim",
  "surfaceBright",
  "outline",
  "outlineVariant",
  "inverseSurface",
  "inverseOnSurface",
  "inversePrimary",
  "scrim",
] as const;

export type ColorRole = (typeof ROLES)[number];
export type TokenMap = Record<ColorRole, string>;

const KEBAB: Record<ColorRole, string> = Object.fromEntries(
  ROLES.map((r) => [r, r.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)]),
) as Record<ColorRole, string>;

export function tokensFromSeed(seedArgb: number | null, isDark: boolean): TokenMap {
  const scheme = new SchemeExpressive(Hct.fromInt(seedArgb ?? DEFAULT_SEED), isDark, 0);
  const out = {} as TokenMap;
  for (const role of ROLES) {
    const dynamic = (MaterialDynamicColors as unknown as Record<string, { getArgb: (s: unknown) => number }>)[
      role
    ];
    if (!dynamic) continue;
    out[role] = hexFromArgb(dynamic.getArgb(scheme));
  }
  return out;
}

export function cssVars(tokens: TokenMap): [string, string][] {
  return ROLES.map((role) => [`--md-sys-color-${KEBAB[role]}`, tokens[role]]);
}
