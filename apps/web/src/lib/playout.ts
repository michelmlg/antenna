/** Comandos do playout (API → worker). Invalidam o estado ao concluir. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

export function usePlayoutControls() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["playout-state"] });
  return {
    start: useMutation({ mutationFn: () => api.post("/playout/start"), onSuccess: refresh }),
    stop: useMutation({ mutationFn: () => api.post("/playout/stop"), onSuccess: refresh }),
    skip: useMutation({ mutationFn: () => api.post("/playout/next"), onSuccess: refresh }),
    playNow: useMutation({
      mutationFn: (mediaId: string) => api.post(`/media/${mediaId}/play`),
      onSuccess: refresh,
    }),
  };
}
