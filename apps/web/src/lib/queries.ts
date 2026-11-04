/**
 * Queries compartilhadas entre telas — uma chave por recurso, para o SSE
 * invalidar tudo de uma vez (lib/sse.ts) e o cache não duplicar requisições.
 */
import { useQuery } from "@tanstack/react-query";
import { api, type GenreRow, type PlayoutState, type ScheduleRow, type StreamInfo } from "./api";

export function usePlayoutState() {
  return useQuery({
    queryKey: ["playout-state"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 5000,
  });
}

export function useStreamInfo() {
  return useQuery({
    queryKey: ["stream"],
    queryFn: () => api.get<StreamInfo>("/stream"),
    refetchInterval: 15000,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: ["genres"],
    queryFn: () => api.get<GenreRow[]>("/genres"),
    refetchInterval: 15000,
  });
}

/** Mesma chave da grade (features/grade/useScheduleMutations) — cache compartilhado. */
export function useSchedule() {
  return useQuery({
    queryKey: ["schedule"],
    queryFn: () => api.get<ScheduleRow[]>("/schedule"),
  });
}
