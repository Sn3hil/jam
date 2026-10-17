export interface VoteRules {
  needed(n: number): number;
  validVotes(votes: Iterable<number>, listeners: Iterable<number>): number[];
}

export function createVotes(): VoteRules {
  return {
    needed: (n: number): number => {
      if (n < 1) n = 1;
      return Math.floor(n / 2) + 1;
    },
    validVotes: (votes, listeners) => {
      const listenerSet = listeners instanceof Set ? listeners : new Set(listeners);
      return [...votes].filter((id) => listenerSet.has(id));
    },
  };
}

export function majorityReached(validCount: number, listenerCount: number): boolean {
  if (listenerCount < 1) return false;
  const n = listenerCount < 1 ? 1 : listenerCount;
  return validCount >= Math.floor(n / 2) + 1;
}
