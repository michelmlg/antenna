/**
 * No Ar — console do canal.
 * Coluna esquerda: player 16:9 + lower-third (progresso, título no ar, transporte)
 * + barra de transmissão. Rail direito: estado + rundown da fila (scroll própria,
 * fim estimado). Faixa inferior: régua do dia (24h), últimos exibidos e saúde.
 */
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  Loader2,
  Play,
  SkipForward,
  Square,
} from "lucide-react";
import { toMin } from "@antenna/core/schedule";
import {
  api,
  type HistoryRow,
  type PlayoutState,
  type QueueItemView,
  type ScheduleRow,
  type StreamInfo,
} from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Spinner, Tabs, fmtDur } from "../components/ui";
import { LivePlayer } from "../components/LivePlayer";
import { GenreIcon } from "../lib/icons";

function thumbOf(item: QueueItemView): string | null {
  if (item.thumbnailUrl) return item.thumbnailUrl;
  if (item.resolvedId) return `https://i.ytimg.com/vi/${item.resolvedId}/mqdefault.jpg`;
  return null;
}

const hhmm = (iso: string): string =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * URLS de transmissão do canal. HLS/M3U/XMLTV passam pela front door (nginx :3000
 * — o /hls injeta o Bearer do hlsCDNSecret, sem o 302 de cookie-check); RTSP/RTMP
 * saem direto do MediaMTX nas portas publicadas. O host vem da origem que o
 * operador usou para abrir o painel: o `rtspPath` da API traz o placeholder
 * "<ip-da-lan>", que não dá para copiar.
 */
type StreamLink = { label: string; who: string; url: string; http: boolean };

function streamLinks(stream: StreamInfo): StreamLink[] {
  const origin = location.origin;
  const host = location.hostname;
  return [
    { label: "HLS", who: "navegador", url: `${origin}${stream.hlsPath}`, http: true },
    { label: "RTSP", who: "VLC", url: `rtsp://${host}:8554/${stream.channel}`, http: false },
    { label: "RTMP", who: "ffmpeg", url: `rtmp://${host}:1935/${stream.channel}`, http: false },
    { label: "M3U", who: "Jellyfin", url: `${origin}/api/v1/iptv/channels.m3u`, http: true },
    { label: "XMLTV", who: "guia EPG", url: `${origin}/api/v1/epg/guide.xml`, http: true },
  ];
}

/** A Clipboard API só existe em contexto seguro — na LAN (http://ip) cai no execCommand. */
function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      if (document.execCommand("copy")) resolve();
      else reject(new Error("cópia recusada"));
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(ta);
    }
  });
}

function CopyBtn({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="shrink-0 px-1.5"
      title={copied ? "Copiado" : "Copiar URL"}
      onClick={() => {
        copyText(url)
          .then(() => setCopied(true))
          .catch(() => setCopied(false));
      }}
    >
      {copied ? <Check size={13} className="text-signal" /> : <Copy size={13} />}
    </Button>
  );
}

function StreamRow({ link }: { link: StreamLink }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 font-mono text-[10px] uppercase text-muted">
        {link.label} <span className="text-muted/50">{link.who}</span>
      </span>
      {link.http ? (
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer"
          title="Abrir em nova aba"
          className="min-w-0 max-w-56 truncate font-mono text-[11px] text-foreground transition-colors hover:text-signal"
        >
          {link.url}
        </a>
      ) : (
        <span className="min-w-0 max-w-56 truncate font-mono text-[11px] text-foreground">
          {link.url}
        </span>
      )}
      <CopyBtn url={link.url} />
    </div>
  );
}

function StreamUrls({ stream }: { stream: StreamInfo | undefined }) {
  if (!stream) {
    return (
      <div className="px-4 py-2.5 text-[11px] text-muted">
        sem info de stream — API indisponível
      </div>
    );
  }
  const links = streamLinks(stream);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5">
      {/* essenciais sempre visíveis: HLS (player) + RTSP (VLC) */}
      {links.slice(0, 2).map((l) => (
        <StreamRow key={l.label} link={l} />
      ))}
      <details className="group">
        <summary className="flex cursor-pointer list-none select-none items-center gap-1 text-[11px] text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
          outras formas (RTMP, M3U, XMLTV)
        </summary>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1.5">
          {links.slice(2).map((l) => (
            <StreamRow key={l.label} link={l} />
          ))}
        </div>
      </details>
      {stream.viewers != null && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
          <Eye size={12} /> {stream.viewers} assistindo
        </span>
      )}
    </div>
  );
}

/**
 * Relógio local de 1s — sem isto o tempo congela: o payload do playout não muda
 * enquanto o mesmo item toca (structural sharing no TanStack Query), então o
 * componente só repintaria na troca de item. O cálculo é de relógio de parede,
 * igual ao do worker (playout.ts — fim do item por elapsed >= duration).
 * O primeiro tick é ancorado na virada do segundo para o contador não atrasar.
 */
function useElapsed(startedAt: string | undefined, duration: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const read = () => setNow(Date.now());
    read(); // troca de item: não espera o próximo tick para zerar a barra
    let timer = window.setTimeout(
      () => {
        read();
        timer = window.setInterval(read, 1000);
      },
      1000 - (Date.now() % 1000),
    );
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

  const known = duration > 0 && !!startedAt;
  const total = startedAt
    ? Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000))
    : 0;
  // o worker só encerra no tick seguinte (até 5s + cooldown) → trava em 100% até trocar
  const elapsed = known ? Math.min(total, duration) : total;
  const pct = known ? Math.min(100, (elapsed / duration) * 100) : 0;
  const remaining = known ? Math.max(0, duration - elapsed) : null;
  return { known, elapsed, pct, remaining };
}

/** Rundown — fila de próximos como linhas compactas; ações reveladas no hover. */
function Rundown({
  items,
  onPlay,
}: {
  items: QueueItemView[];
  onPlay?: (mediaId: string) => void;
}) {
  if (!items.length) return <Empty>fila vazia — gerando a próxima sequência…</Empty>;
  return (
    <ol className="space-y-1.5">
      {items.map((it, i) => {
        const thumb = thumbOf(it);
        const isYT = it.source === "youtube";
        return (
          <li
            key={`${it.mediaId}-${i}`}
            className="group flex items-center gap-2.5 rounded-lg border border-muted/10 bg-background/40 p-1.5 transition-colors hover:border-signal/30 focus-within:border-signal/40"
          >
            <span className="w-4 shrink-0 text-center text-[11px] text-muted tnum">{i + 1}</span>
            {thumb ? (
              <img
                src={thumb}
                alt=""
                loading="lazy"
                className="h-10 w-[71px] shrink-0 rounded-md object-cover"
              />
            ) : (
              <div className="flex h-10 w-[71px] shrink-0 items-center justify-center rounded-md bg-muted/10 text-[10px] text-muted">
                {it.source}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-[13px] font-medium leading-snug">{it.title}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
                {it.genre && (
                  <span className="flex shrink-0 items-center gap-1">
                    <i
                      className="h-2 w-2 shrink-0 rounded-sm"
                      style={{ background: it.genre.color || "#3b82f6" }}
                    />
                    {it.genre.name}
                  </span>
                )}
                {it.channelTitle && <span className="truncate">{it.channelTitle}</span>}
                <span className="ml-auto shrink-0 tnum">{fmtDur(it.duration)}</span>
              </div>
            </div>
            {/* sem hover (touch) as ações ficam sempre visíveis */}
            <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 hover:opacity-100 max-xl:opacity-100">
              {onPlay && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="px-1.5"
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
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Régua do dia — 24h em escala, blocos coloridos por gênero, agulha no horário
 * atual. Clique leva à grade. Geometria em minutos (igual à grade).
 */
function TodayRuler({ rows }: { rows: ScheduleRow[] }) {
  const navigate = useNavigate();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  if (!rows.length) return <Empty>sem blocos hoje — seleção automática</Empty>;
  const pct = (min: number) => `${(Math.min(1440, Math.max(0, min)) / 1440) * 100}%`;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const gap = Math.max(0.15, (nowMin / 1440) * 100); // margem mínima para a agulha não colar em 0

  return (
    <button
      type="button"
      onClick={() => navigate("/grade")}
      title="Abrir a grade"
      className="block w-full cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-signal/50"
    >
      <div className="relative h-14 overflow-hidden rounded-lg bg-background/50 ring-1 ring-inset ring-muted/10">
        {rows.map((r) => {
          const start = toMin(r.startTime);
          const end = toMin(r.endTime);
          const w = Math.max(0, (end - start) / 1440);
          return (
            <div
              key={r.id}
              title={`${r.startTime}–${r.endTime} · ${r.program.name}`}
              className="absolute inset-y-0 flex flex-col justify-center gap-0.5 overflow-hidden px-2"
              style={{
                left: pct(start),
                width: `${w * 100}%`,
                background: r.program.genre?.color || "#3b82f6",
              }}
            >
              {w >= 0.09 && (
                <>
                  {/* horário + nome completo — encaixam na linha no bloco largo */}
                  <div className="relative flex items-center gap-1 text-[10px] leading-none">
                    <span className="shrink-0 tnum text-background/85">
                      {r.startTime}–{r.endTime}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center gap-1 text-[11px] font-semibold leading-tight text-background">
                    <GenreIcon name={r.program.genre?.icon} size={11} className="shrink-0" />
                    <span className="truncate">{r.program.name}</span>
                  </div>
                </>
              )}
            </div>
          );
        })}
        {/* horários sem bloco = seleção automática (fundo escuro da régua) */}
        <div className="absolute inset-y-0 top-0 z-10 w-0.5 bg-signal" style={{ left: `${gap}%` }}>
          <i className="absolute -left-[3px] top-0 h-2 w-2 rounded-full bg-signal" />
        </div>
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-muted tnum">
        <span className="absolute left-0">00</span>
        <span className="absolute -translate-x-1/2" style={{ left: "25%" }}>
          06
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: "50%" }}>
          12
        </span>
        <span className="absolute -translate-x-1/2" style={{ left: "75%" }}>
          18
        </span>
        <span className="absolute right-0">24</span>
      </div>
    </button>
  );
}

/** Saúde — estado do canal + diagnóstico do worker. */
function Health({ state, pid }: { state: PlayoutState | undefined; pid: number | null }) {
  const offline = state?.workerOnline === false;
  const cur = state?.current;
  return (
    <dl className="space-y-2 text-sm">
      {/* canal no ar/parado — era o card de status, foi junto das tabs */}
      <div className="flex items-center justify-between gap-2">
        <dt className="text-muted">canal</dt>
        <dd className="flex min-w-0 items-center gap-2">
          {cur?.isFallback && <Badge tone="red">fallback</Badge>}
          {cur?.programName && (
            <span className="truncate text-xs font-medium text-signal">{cur.programName}</span>
          )}
          <span className="flex shrink-0 items-center gap-1.5">
            <i className={`h-2 w-2 rounded-full ${state?.running ? "bg-signal" : "bg-muted/60"}`} />
            {state?.running ? "no ar" : "parado"}
          </span>
        </dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-muted">worker</dt>
        <dd className="flex items-center gap-1.5">
          <i className={`h-2 w-2 rounded-full ${offline ? "bg-danger" : "bg-emerald-400"}`} />
          {offline ? "offline" : "online"}
        </dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-muted">erros / restarts</dt>
        <dd className="tnum">
          {state?.errors ?? 0} / {state?.restarts ?? 0}
        </dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-muted">pid ffmpeg</dt>
        <dd className="font-mono text-xs">{pid ?? "—"}</dd>
      </div>
      <div className="flex items-center justify-between">
        <dt className="text-muted">sessão desde</dt>
        <dd className="tnum text-xs">{state?.since ? hhmm(state.since) : "—"}</dd>
      </div>
    </dl>
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
  const running = !!state?.running;
  const queue = state?.queue ?? [];
  const today = (schedule ?? []).filter((r) => r.dayOfWeek === new Date().getDay());

  const { known, elapsed, pct, remaining } = useElapsed(cur?.startedAt, cur?.duration ?? 0);

  // fim estimado da fila: restante do item atual + soma das durações da fila
  // (refetch a cada 5s mantém atualizado; sem relógio extra)
  const queueTotal = queue.reduce((s, i) => s + i.duration, 0);
  let queueEta: string | null = null;
  if (running && cur && queue.length) {
    const left = (known ? remaining! : 0) + queueTotal;
    queueEta = `${hhmm(new Date(Date.now() + left * 1000).toISOString())} · ${Math.round(left / 60)} min`;
  }

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="flex min-h-0 flex-col gap-4 xl:flex-row">
        {/* ---------- console: player + lower-third + transmissão ---------- */}
        <Card flush className="flex min-w-0 flex-1 flex-col">
          <LivePlayer
            src={hlsUrl}
            live={running}
            mediaKey={cur?.mediaId}
            offlineAction={
              running || start.isPending
                ? undefined
                : { label: "Iniciar playout", onClick: () => start.mutate() }
            }
          />

          {/* lower-third: progresso na borda superior, título + transporte */}
          {known && cur && (
            <div className="h-1 w-full bg-muted/15">
              <div
                className="h-full bg-signal transition-all duration-1000 ease-linear motion-reduce:transition-none"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="line-clamp-1 text-[15px] font-semibold leading-tight">
                {cur ? cur.title : running ? "sintonizando…" : "—"}
              </div>
              <div className="mt-1 text-[11px] text-muted tnum">
                {cur
                  ? known
                    ? `${fmtDur(elapsed)} · resta ${fmtDur(remaining!)}`
                    : `${fmtDur(elapsed)} · duração desconhecida`
                  : running
                    ? "aguardando o primeiro item"
                    : "playout parado"}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {running ? (
                <>
                  <Button
                    variant="signal"
                    onClick={() => skip.mutate()}
                    disabled={skip.isPending}
                    title="Pular para o próximo da fila"
                  >
                    <span className="flex items-center gap-1.5">
                      {skip.isPending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <SkipForward size={14} />
                      )}
                      Pular
                    </span>
                  </Button>
                  <Button
                    onClick={() => stop.mutate()}
                    disabled={stop.isPending}
                    title="Parar o playout"
                  >
                    <span className="flex items-center gap-1.5">
                      <Square size={11} /> Parar
                    </span>
                  </Button>
                </>
              ) : (
                <Button variant="signal" onClick={() => start.mutate()} disabled={start.isPending}>
                  <span className="flex items-center gap-1.5">
                    {start.isPending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Play size={14} />
                    )}
                    Iniciar playout
                  </span>
                </Button>
              )}
            </div>
          </div>

          {/* erro de playback: junto do contexto relevante, truncado */}
          {state?.lastError && (
            <div className="flex items-start gap-2 border-t border-danger/25 bg-danger/5 px-4 py-2 text-[11px] leading-relaxed text-danger">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span className="min-w-0 line-clamp-2">{state.lastError}</span>
            </div>
          )}

          <div className="mt-auto border-t border-muted/10">
            <StreamUrls stream={stream} />
          </div>
        </Card>

        {/* ---------- rail: fila comprimida + tabs, casando com o player ---------- */}
        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[380px] xl:min-h-0">
          {/* fila é o card principal do rail (70/30) — rola internamente */}
          <Card className="flex min-h-0 flex-[7] flex-col">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] font-semibold text-muted">A seguir</span>
              {queue.length > 0 && (
                <span className="text-[11px] text-muted tnum">{queue.length} na fila</span>
              )}
            </div>
            <div className="mt-2 min-h-0 max-h-[220px] flex-1 overflow-y-auto pr-0.5 xl:max-h-none">
              <Rundown items={queue} onPlay={(id) => play.mutate(id)} />
            </div>
            <div className="mt-3 shrink-0 space-y-0.5 border-t border-muted/10 pt-2 text-[11px] text-muted">
              {queueEta && <div className="tnum">fila vai até ~{queueEta}</div>}
              <div>a fila muda só com Pular ou troca de bloco</div>
            </div>
            <ErrorMsg error={play.error} />
          </Card>

          <DetailTabs state={state} pid={cur?.pid ?? null} />
        </aside>
      </div>

      {/* ---------- faixa inferior: programação de hoje, full-width ---------- */}
      <Card>
        <div className="mb-2.5 text-[11px] font-semibold text-muted">Programação de hoje</div>
        <TodayRuler rows={today} />
      </Card>
    </div>
  );
}

/** Tabs à direita: Últimos exibidos (inicial) e Saúde — card de altura constante. */
function DetailTabs({ state, pid }: { state: PlayoutState | undefined; pid: number | null }) {
  const [tab, setTab] = useState<"exibidos" | "saude">("exibidos");
  const issues = state?.workerOnline === false || !!state?.lastError;
  return (
    <Card className="flex min-h-0 flex-[3] flex-col">
      <Tabs
        tabs={[
          { id: "exibidos", label: "Últimos exibidos" },
          { id: "saude", label: "Saúde", dot: issues },
        ]}
        active={tab}
        onChange={setTab}
      />
      {/* altura fixa: o painel é o mesmo nas duas tabs e rola quando não cabe */}
      <div className="min-h-0 max-h-[280px] flex-1 overflow-y-auto pt-2.5 xl:max-h-none">
        {tab === "exibidos" ? <RecentHistory /> : <Health state={state} pid={pid} />}
      </div>
    </Card>
  );
}

function RecentHistory() {
  const { data: history } = useQuery({
    queryKey: ["history"],
    queryFn: () => api.get<HistoryRow[]>("/playout/history?take=6"),
    refetchInterval: 10000,
  });
  if (!history) return <Spinner />;
  if (!history.length) return <Empty>nada exibido ainda</Empty>;
  return (
    <ul className="divide-y divide-muted/10">
      {history.map((h) => (
        <li key={h.id} className="flex items-baseline gap-2 py-2">
          <span className="shrink-0 text-[11px] text-muted tnum">{hhmm(h.startedAt)}</span>
          <span className="min-w-0 flex-1 line-clamp-1 text-[13px]">{h.media.title}</span>
          {h.result === "success" && <Badge tone="green">ok</Badge>}
          {h.result === "playing" && <Badge tone="signal">no ar</Badge>}
          {h.result === "error" && <Badge tone="red">erro</Badge>}
          {h.result === "stopped" && <Badge>parado</Badge>}
          {h.result === "skipped" && <Badge tone="signal">pulou</Badge>}
          {h.result === "fallback" && <Badge>fallback</Badge>}
        </li>
      ))}
    </ul>
  );
}
