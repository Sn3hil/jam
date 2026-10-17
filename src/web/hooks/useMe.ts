import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../api";
import type { UserDTO } from "@shared/protocol";

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<UserDTO | null> => {
      try {
        const res = await apiFetch<{ user: UserDTO }>("/api/auth/me");
        return res.user;
      } catch (e) {
        if ((e as { status?: number }).status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}
