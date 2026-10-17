export const springs = {
  spatial: {
    fast: { type: "spring", stiffness: 800, damping: 34 },
    default: { type: "spring", stiffness: 380, damping: 31 },
    slow: { type: "spring", stiffness: 200, damping: 23 },
  },
  effects: {
    fast: { type: "spring", stiffness: 3800, damping: 123 },
    default: { type: "spring", stiffness: 1600, damping: 80 },
    slow: { type: "spring", stiffness: 800, damping: 57 },
  },
} as const;
