/** No Ar — LivePlayer, agora tocando, fila estável (thumbs/gênero/canal/link), Pular. */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Play, SkipForward } from "lucide-react";
import {
  api,
  type HistoryRow,
  type PlayoutState,
  type QueueItemView,
  type ScheduleRow,
  type StreamInfo,
} from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Spinner, fmtDur } from "../components/ui";
import { LivePlayer } from "../components/LivePlayer";
import { GenreIcon } from "../lib/icons";

function thumbOf(item: QueueItemView): string | null {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  if (item.resolvedId) return `https://i.ytimg.com/vi/${item.resolvedId}/mqdefault.jpg`;
  return null;
}

function Progress({ startedAt, duration }: { startedAt: string; duration: number }) {
  const [now, setNow] = useState(() => Date.now());

  /**
   * Relógio local de 1s — sem isto o tempo congela: o payload do playout não muda
   * enquanto o mesmo item toca (structural sharing no TanStack Query), então o
   * componente só repintaria na troca de item. O cálculo é de relógio de parede,
   * igual ao do worker (playout.ts — fim do item por elapsed >= duration).
   * O primeiro tick é ancorado na virada do segundo para o contador não atrasar.
   */
  useEffect(() => {
    const read = () => setNow(Date.now());
    read(); // troca de item: não espera o próximo tick para zerar a barra
    let timer = window.setTimeout(() => {
      read();
      timer = window.setInterval(read, 1000);
    }, 1000 - (Date.now() % 1000));
    // aba em background throttliza o interval (~1/min) → repinta ao voltar ao foco
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [startedAt]);

  const startMs = new Date(startedAt).getTime();
  const total = Math.max(0, Math.round((now - startMs) / 1000));
  const known = duration > 0;
  // o worker só encerra no tick seguinte (até 5s + cooldown) → trava em 100% até trocar
  const elapsed = known ? Math.min(total, duration) : total;
  const pct = known ? Math.min(100, (elapsed / duration) * 100) : 0;

  return (
    <div className="mt-2">
      {known && (
        <div className="h-1.5 overflow-hidden rounded bg-muted/20">
          <div className="h-full bg-signal transition-all" style={{ width: `${pct}%` }} />
        </div>
      )}
      <div className="mt-1 flex justify-between text-[11px] text-muted">
        <span>{fmtDur(elapsed)}</span>
        <span>{known ? `-${fmtDur(Math.max(0, duration - elapsed))}` : "duração desconhecida"}</span>
      </div>
    </div>
  );
}

function QueueList({
  items,
  program,
  onPlay,
}: {
  items: QueueItemView[];
  program: string | null;
  onPlay?: (mediaId: string) => void;
}) {
  if (!items.length) return <Empty>fila vazia — gerando a próxima sequência…</Empty>;
  return (
    <ol className="space-y-2">
      {items.map((it, i) => {
        const thumb = thumbOf(it);
        const isYT = it.source === "youtube";
        return (
          <li
            key={`${it.mediaId}-${i}`}
            className="flex items-center gap-2.5 rounded border border-muted/10 bg-background/40 p-2"
          >
            <span className="w-5 text-center font-mono text-xs text-muted">{i + 1}</span>
            {thumb ? (
              <img
                src={thumb}
                alt=""
                loading="lazy"
                className="h-10 w-[71px] shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex h-10 w-[71px] shrink-0 items-center justify-center rounded bg-muted/10 text-[10px] text-muted">
                {it.source}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-sm">{it.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {it.genre && (
                  <span
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold text-background"
                    style={{ background: it.genre.color || "#3b82f6" }}
                  >
                    <GenreIcon name={it.genre.icon} size={10} /> {it.genre.name}
                  </span>
                )}
                {it.channelTitle && (
                  <span className="text-[11px] text-muted">{it.channelTitle}</span>
                )}
                <span className="text-[11px] text-muted">{fmtDur(it.duration)}</span>
              </div>
            </div>
            {onPlay && (
              <Button
                size="sm"
                variant="ghost"
                title="Colocar no ar agora (interrompe o atual e consome este item da fila)"
                onClick={() => onPlay(it.mediaId)}
              >
                <Play size={14} className="text-signal" />
              </Button>
            )}
            {isYT && (
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                title="Abrir no YouTube"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted transition-colors hover:bg-muted/10 hover:text-signal"
              >
                <ExternalLink size={14} />
              </a>
            )}
          </li>
        );
      })}
      {program && (
        <li className="pt-1 text-right text-[11px] text-muted">
          bloco: {program} · a fila muda só com Pular ou troca de bloco
        </li>
      )}
    </ol>
  );
}

export default function NoAr() {
  const { data: state } = useQuery({
    queryKey: ["playout-state"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 5000,
  });
  const { data: stream } = useQuery({
    queryKey: ["stream"],
    queryFn: () => api.get<StreamInfo>("/stream"),
  });
  const { data: schedule } = useQuery({
    queryKey: ["schedule"],
    queryFn: () => api.get<ScheduleRow[]>("/schedule"),
  });

  const start = useMutation({ mutationFn: () => api.post("/playout/start") });
  const stop = useMutation({ mutationFn: () => api.post("/playout/stop") });
  const skip = useMutation({ mutationFn: () => api.post("/playout/next") });
  const qc = useQueryClient();
  const play = useMutation({
    mutationFn: (mediaId: string) => api.post(`/media/${mediaId}/play`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playout-state"] }),
  });

  const hlsUrl = stream ? `${location.origin}${stream.hlsPath}` : null;
  const cur = state?.current;
  const today = (schedule ?? []).filter((r) => r.dayOfWeek === new Date().getDay());

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      {/* player */}
      <Card className="xl:col-span-2">
        <LivePlayer src={hlsUrl} live={!!state?.running} mediaKey={cur?.mediaId} />
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

      {/* agora + controles + fila */}
      <Card>
        <div className="mb-2 flex items-center gap-2">
          {cur ? (
            <Badge tone="signal">NO AR</Badge>
          ) : (
            <Badge>{state?.running ? "sintonizando…" : "parado"}</Badge>
          )}
          {cur?.programName && <span className="text-xs text-signal">{cur.programName}</span>}
          {cur?.isFallback && <Badge tone="red">fallback</Badge>}
        </div>
        <h2 className="line-clamp-2 text-lg font-semibold leading-snug">{cur ? cur.title : "—"}</h2>
        {cur && <Progress startedAt={cur.startedAt} duration={cur.duration} />}
        {state?.lastError && (
          <p className="mt-2 line-clamp-2 text-[11px] text-danger">⚠ {state.lastError}</p>
        )}

        <div className="mt-4 flex gap-2">
          <Button variant="signal" onClick={() => start.mutate()} disabled={!!state?.running}>
            Iniciar playout
          </Button>
          <Button onClick={() => stop.mutate()} disabled={!state?.running}>
            Parar
          </Button>
          <Button
            onClick={() => skip.mutate()}
            disabled={!state?.running}
            title="Pular para o próximo da fila"
          >
            <span className="flex items-center gap-1.5">
              <SkipForward size={14} /> Pular
            </span>
          </Button>
        </div>
        {skip.isPending && <Spinner label="pulando…" />}

        <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
          Próximos na programação
        </div>
        <div className="mt-2">
          <QueueList
            items={state?.queue ?? []}
            program={cur?.programName ?? state?.next?.program ?? null}
            onPlay={(id) => play.mutate(id)}
          />
        </div>
        <ErrorMsg error={play.error} />
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
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-background"
                  style={{ background: r.program.genre?.color || "#3b82f6" }}
                >
                  <GenreIcon name={r.program.genre?.icon} size={12} /> {r.program.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* últimos exibidos */}
      <Card className="xl:col-span-2">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Últimos exibidos
        </div>
        <RecentHistory />
      </Card>

      {/* diagnóstico */}
      <Card>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Diagnóstico
        </div>
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
      </Card>
    </div>
  );
}

function RecentHistory() {
  const { data: history } = useQuery({
    queryKey: ["history"],
    queryFn: () => api.get<HistoryRow[]>("/playout/history?take=8"),
    refetchInterval: 10000,
  });
  if (!history) return <Spinner />;
  return (
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
              {h.result === "skipped" && <Badge tone="signal">pulou</Badge>}
              {h.result === "fallback" && <Badge>fallback</Badge>}
            </td>
            <td className="py-1.5 text-right font-mono text-xs text-muted">
              {new Date(h.startedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
