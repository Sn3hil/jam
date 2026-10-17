import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import type { HistoryItem } from "@shared/protocol";

export interface HistoryPage {
  items: HistoryItem[];
  nextCursor: string | null;
}

export function useHistory(view: "recent" | "top", q: string) {
  return useInfiniteQuery({
    queryKey: ["history", view, q],
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ view, limit: "20" });
      if (q.trim()) params.set("q", q.trim());
      if (pageParam) params.set("cursor", pageParam);
      return apiFetch<HistoryPage>(`/api/history?${params.toString()}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    staleTime: 30_000,
  });
}
