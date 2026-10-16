/** No Ar — player, agora tocando, fila, grade de hoje, últimos exibidos. */
import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Hls from "hls.js";
import { api, type HistoryRow, type PlayoutState, type QueuePlan, type ScheduleRow, type StreamInfo } from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Spinner, fmtDur } from "../components/ui";

function Player({ url }: { url: string | null }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video || !url) return;
    let hls: Hls | null = null;
    if (Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: false });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(() => {});
    }
    return () => hls?.destroy();
  }, [url]);

  return (
    <video ref={ref} playsInline muted autoPlay controls className="aspect-video w-full rounded-lg bg-black" />
  );
}

function Progress({ startedAt, duration }: { startedAt: string; duration: number }) {
  const elapsed = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
  const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="h-1.5 overflow-hidden rounded bg-muted/20">
        <div className="h-full bg-signal transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{fmtDur(elapsed)}</span>
        <span>{duration > 0 ? `-${fmtDur(Math.max(0, duration - elapsed))}` : "duração desconhecida"}</span>
      </div>
    </div>
  );
}

export default function NoAr() {
  const { data: state } = useQuery({
    queryKey: ["playout-state"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 5000,
  });
  const { data: stream } = useQuery({ queryKey: ["stream"], queryFn: () => api.get<StreamInfo>("/stream") });
  const { data: queue } = useQuery({
    queryKey: ["playout-queue"],
    queryFn: () => api.get<QueuePlan>("/playout/queue?count=6"),
    refetchInterval: 15000,
  });
  const { data: schedule } = useQuery({ queryKey: ["schedule"], queryFn: () => api.get<ScheduleRow[]>("/schedule") });
  const { data: history } = useQuery({
    queryKey: ["history"],
    queryFn: () => api.get<HistoryRow[]>("/playout/history?take=8"),
    refetchInterval: 10000,
  });

  const start = useMutation({ mutationFn: () => api.post("/playout/start") });
  const stop = useMutation({ mutationFn: () => api.post("/playout/stop") });

  const hlsUrl = stream ? `${location.origin}${stream.hlsPath}` : null;
  const cur = state?.current;

  const today = (schedule ?? []).filter((r) => r.dayOfWeek === new Date().getDay());

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* player */}
      <Card className="xl:col-span-2">
        <Player url={hlsUrl} />
        <div className="mt-3 space-y-1 text-xs text-muted">
          <div>
            HLS <code className="text-foreground">{hlsUrl || "—"}</code>
          </div>
          <div>
            RTSP (VLC) <code className="text-foreground">{stream?.rtspPath || "—"}</code>
            {stream?.viewers != null && <> · {stream.viewers} assistindo</>}
          </div>
        </div>
      </Card>

      {/* agora + fila */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          {cur ? <Badge tone="signal">NO AR</Badge> : <Badge>{state?.running ? "sintonizando…" : "parado"}</Badge>}
          {cur?.programName && <span className="text-xs text-signal">{cur.programName}</span>}
          {cur?.isFallback && <Badge tone="red">fallback</Badge>}
        </div>
        <h2 className="line-clamp-2 text-lg font-semibold leading-snug">{cur ? cur.title : "—"}</h2>
        {cur && <Progress startedAt={cur.startedAt} duration={cur.duration} />}
        {state?.lastError && <p className="mt-2 line-clamp-2 text-[11px] text-red-400">⚠ {state.lastError}</p>}

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">Fila projetada</div>
        {queue ? (
          <ol className="mt-2 space-y-1.5">
            {queue.items.length === 0 && <li className="text-xs text-muted">vazia</li>}
            {queue.items.map((it, i) => (
              <li key={`${it.mediaId}-${i}`} className="flex items-baseline gap-2 text-sm">
                <span className="text-muted">{i + 1}.</span>
                <span className="line-clamp-1 flex-1">{it.title}</span>
                <span className="text-[11px] text-muted">{fmtDur(it.duration)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <Spinner />
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="signal" onClick={() => start.mutate()} disabled={!!state?.running}>
            Iniciar playout
          </Button>
          <Button onClick={() => stop.mutate()} disabled={!state?.running}>
            Parar
          </Button>
        </div>
      </Card>

      {/* grade de hoje */}
      <Card>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Programação de hoje
        </div>
        {today.length === 0 ? (
          <Empty>sem blocos hoje — seleção automática</Empty>
        ) : (
          <ul className="space-y-1.5">
            {today.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs text-muted">
                  {r.startTime}–{r.endTime}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-xs font-medium text-background"
                  style={{ background: r.program.genre?.color || "#3b82f6" }}
                >
                  {r.program.genre?.icon} {r.program.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* últimos exibidos */}
      <Card className="xl:col-span-2">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Últimos exibidos</div>
        {history ? (
          <table className="w-full text-sm">
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-muted/10">
                  <td className="py-1.5 pr-2 font-mono text-xs text-muted">{fmtDur(h.duration)}</td>
                  <td className="line-clamp-1 py-1.5 pr-2">{h.media.title}</td>
                  <td className="py-1.5 pr-2 text-right">
                    {h.result === "success" && <Badge tone="green">ok</Badge>}
                    {h.result === "playing" && <Badge tone="signal">no ar</Badge>}
                    {h.result === "error" && <Badge tone="red">erro</Badge>}
                    {h.result === "stopped" && <Badge>parado</Badge>}
                    {h.result === "fallback" && <Badge tone="muted">fallback</Badge>}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs text-muted">
                    {new Date(h.startedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Spinner />
        )}
      </Card>

      {/* controles avançados */}
      <Card>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Diagnóstico</div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">worker</dt>
            <dd>{state?.workerOnline ? "online" : "offline"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">erros / restarts</dt>
            <dd>
              {state?.errors ?? 0} / {state?.restarts ?? 0}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">pid ffmpeg</dt>
            <dd className="font-mono">{cur?.pid ?? "—"}</dd>
          </div>
        </dl>
        <ErrorMsg error={start.error ?? stop.error} />
      </Card>
    </div>
  );
}
