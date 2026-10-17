import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueueItem } from "@shared/protocol";
import { apiFetch } from "../api";
import { describeApiError } from "../lib/ws";
import { pushToast } from "../state/toasts";

export function useQueueActions() {
  const qc = useQueryClient();

  const common = {
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["history"] });
    },
  };

  const enqueueVideo = useMutation({
    mutationFn: (videoId: string): Promise<{ item: QueueItem }> =>
      apiFetch("/api/queue", { body: { videoId } }),
    onError: (e) => pushToast(describeApiError(e)),
    ...common,
  });

  const enqueueUrl = useMutation({
    mutationFn: (url: string): Promise<{ item: QueueItem }> => apiFetch("/api/queue", { body: { url } }),
    onError: (e) => pushToast(describeApiError(e)),
    ...common,
  });

  const enqueueHistory = useMutation({
    mutationFn: (historyId: number): Promise<{ item: QueueItem }> =>
      apiFetch("/api/queue", { body: { historyId } }),
    onError: (e) => pushToast(describeApiError(e)),
    ...common,
  });

  const remove = useMutation({
    mutationFn: (itemId: string): Promise<void> =>
      apiFetch(`/api/queue/${encodeURIComponent(itemId)}`, { method: "DELETE" }),
    onError: (e) => pushToast(describeApiError(e)),
  });

  const skipVote = useMutation({
    mutationFn: (vote: boolean): Promise<{ votes: number; votesNeeded: number }> =>
      apiFetch("/api/skip-vote", { method: "PUT", body: { vote } }),
    onError: (e) => pushToast(describeApiError(e)),
  });

  const setPlaybackPaused = useMutation({
    mutationFn: (paused: boolean): Promise<{ status: string }> =>
      apiFetch("/api/playback", { method: "PUT", body: { paused } }),
    onError: (e) => pushToast(describeApiError(e)),
  });

  return { enqueueVideo, enqueueUrl, enqueueHistory, remove, skipVote, setPlaybackPaused };
}
