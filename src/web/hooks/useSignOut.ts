import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../api";

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/api/auth/logout", { method: "POST" }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
}
