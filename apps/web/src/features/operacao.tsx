/**
 * Operação — síntese do canal em cima (estado, no ar agora, erros ativos),
 * depois syncs recentes e histórico de reprodução sob demanda. Linhas, pills
 * e dropdowns seguem os padrões da grade (components/ui).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { api, type HistoryRow, type PlayoutState, type SyncRunRow } from "../lib/api";
import {
  Badge,
  Card,
  Dropdown,
  Empty,
  Spinner,
  StatusPill,
  fmtDur,
  fmtWhen,
} from "../components/ui";

const hhmm = (iso: string): string =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const RESULT_BADGE: Record<string, { tone: "muted" | "signal" | "green" | "red"; label: string }> =
  {
    success: { tone: "green", label: "ok" },
    playing: { tone: "signal", label: "no ar" },
    error: { tone: "red", label: "erro" },
    stopped: { tone: "muted", label: "parado" },
    fallback: { tone: "muted", label: "fallback" },
  };

function ResultBadge({ result }: { result: string }) {
  const r = RESULT_BADGE[result] ?? ({ tone: "muted", label: result } as const);
  return <Badge tone={r.tone}>{r.label}</Badge>;
}

function sourceLabel(s: SyncRunRow["source"]): string {
  return s.type === "search" || s.type === "channelSearch"
    ? `busca "${s.query}"`
    : s.url.replace("https://www.youtube.com/", "");
}

function Synthesis({ state }: { state: PlayoutState | undefined }) {
  const running = !!state?.running;
  const cur = state?.current;
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        {running ? (
          <StatusPill tone="signal" pulse text="no ar" />
        ) : (
          <StatusPill tone="muted" text="parado" />
        )}
        <div className="min-w-0 flex-1">
          <div className="line-clamp-1 text-[15px] font-semibold leading-tight">
            {cur ? cur.title : "canal sem vídeo no ar"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted tnum">
            {cur?.programName && <span className="text-signal">{cur.programName}</span>}
            {state?.next && <span className="line-clamp-1">a seguir: {state.next.title}</span>}
            <span>
              erros {state?.errors ?? 0} · restarts {state?.restarts ?? 0}
            </span>
            {state?.since && <span>sessão desde {hhmm(state.since)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {state?.workerOnline === false ? (
            <StatusPill tone="red" text="worker offline" />
          ) : (
            <StatusPill tone="green" text="worker online" />
          )}
          {state?.stale ? (
            <StatusPill tone="red" text="publicação atrasada" />
          ) : (
            <StatusPill tone="green" text="publicação fresca" />
          )}
        </div>
      </div>

      {state?.lastError && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2 text-[12px] leading-relaxed text-danger">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{state.lastError}</span>
        </div>
      )}
    </Card>
  );
}

function Syncs() {
  const [take, setTake] = useState(30);
  const { data: runs } = useQuery({
    queryKey: ["sync-runs", take],
    queryFn: () => api.get<SyncRunRow[]>(`/sync/runs?take=${take}`),
    refetchInterval: 15000,
  });

  return (
    <Card>
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[11px] font-semibold text-muted">Syncs recentes</span>
        <Dropdown
          align="right"
          title="Quantos resultados mostrar"
          trigger={<span className="text-xs">{take} recentes</span>}
          activeValue={String(take)}
          onSelect={(v) => setTake(Number(v))}
          options={[20, 30, 50, 100].map((n) => ({ value: String(n), label: `${n} recentes` }))}
        />
      </div>
      {!runs ? (
        <Spinner />
      ) : runs.length === 0 ? (
        <Empty>nenhum sync ainda — crie fontes em um gênero</Empty>
      ) : (
        <ul className="space-y-1">
          {runs.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2.5 rounded-lg border border-muted/10 px-2.5 py-1.5 transition-colors hover:border-signal/30"
            >
              <span className="shrink-0 text-[11px] text-muted tnum">{fmtWhen(r.startedAt)}</span>
              {r.source.genre ? (
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted">
                  <i
                    className="h-2 w-2 shrink-0 rounded-sm"
                    style={{ background: r.source.genre.color }}
                  />
                  {r.source.genre.name}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-muted">fonte</span>
              )}
              <span className="min-w-0 flex-1 truncate text-[13px]">
                {sourceLabel(r.source)}
                {r.message && <span className="text-[11px] text-muted"> — {r.message}</span>}
              </span>
              {r.errors > 0 ? (
                <Badge tone="red">{r.errors} erros</Badge>
              ) : r.added > 0 ? (
                <Badge tone="green">+{r.added}</Badge>
              ) : (
                <Badge>ok</Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function History() {
  const [filter, setFilter] = useState("all");
  const { data: history } = useQuery({
    queryKey: ["history-full"],
    queryFn: () => api.get<HistoryRow[]>("/playout/history?take=100"),
    refetchInterval: 15000,
  });
  const filtered = (history ?? []).filter((h) => filter === "all" || h.result === filter);

  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none select-none items-center gap-1.5 text-[11px] font-semibold text-muted transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
        Histórico de reprodução
        {history && <span className="tnum">({history.length} últimas)</span>}
      </summary>
      <Card className="mt-2.5">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-[11px] text-muted">
            cada linha é um vídeo que passou, quando e como terminou
          </span>
          <Dropdown
            align="right"
            title="Filtrar por resultado"
            trigger={
              <span className="text-xs">
                {filter === "all" ? "todos os resultados" : (RESULT_BADGE[filter]?.label ?? filter)}
              </span>
            }
            activeValue={filter}
            onSelect={setFilter}
            options={[
              { value: "all", label: "todos os resultados" },
              { value: "error", label: "só erros" },
              { value: "success", label: "ok" },
              { value: "playing", label: "no ar" },
            ]}
          />
        </div>
        {!history ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <Empty>{filter === "all" ? "nada exibido ainda" : "nada combina com o filtro"}</Empty>
        ) : (
          <ul className="space-y-1">
            {filtered.map((h) => (
              <li
                key={h.id}
                className="flex items-center gap-2.5 rounded-lg border border-muted/10 p-1.5 transition-colors hover:border-signal/30"
              >
                <span className="shrink-0 text-[11px] text-muted tnum">{fmtWhen(h.startedAt)}</span>
                <span className="min-w-0 flex-1 line-clamp-1 text-[13px]">{h.media.title}</span>
                <span className="shrink-0 text-[11px] text-muted tnum">{fmtDur(h.duration)}</span>
                <span className="shrink-0 pr-1.5">
                  <ResultBadge result={h.result} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </details>
  );
}

export default function Operacao() {
  const { data: state } = useQuery({
    queryKey: ["playout-state"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 5000,
  });

  return (
    <div className="flex flex-col gap-4">
      <Synthesis state={state} />
      <Syncs />
      <History />
    </div>
  );
}
