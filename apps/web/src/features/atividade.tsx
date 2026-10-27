/**
 * Atividade — saúde do canal em cima (no ar, destino, última falha com causa),
 * e, em abas, sincronizações, exibidos (com a causa de cada erro) e quarentena.
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, RefreshCw, ShieldAlert, Undo2 } from "lucide-react";
import { FAILURE_INFO, parseHistoryResult, type FailureKind } from "@antenna/shared";
import { api, type HistoryRow, type PlayoutState, type SyncRunRow } from "../lib/api";
import { fmtDur, fmtWhen, hhmm } from "../lib/format";
import { usePlayoutState } from "../lib/queries";
import { GenreDot } from "../components/GenreTile";
import { Thumb, thumbOf } from "../components/Thumb";
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Pill,
  Spinner,
  Tabs,
  useToast,
  type PillTone,
} from "../components/ui";
import { LogoMark } from "../components/Logo";

const RESULT: Record<string, { tone: PillTone; label: string }> = {
  success: { tone: "muted", label: "ok" },
  playing: { tone: "live", label: "no ar" },
  error: { tone: "danger", label: "erro" },
  stopped: { tone: "muted", label: "parado" },
  skipped: { tone: "brand", label: "pulou" },
  fallback: { tone: "muted", label: "reserva" },
};

/** Falha de infra (não é culpa do vídeo) tem outro tom: o vídeo foi poupado. */
function failureTone(kind: FailureKind | null): PillTone {
  return kind && FAILURE_INFO[kind].blame === "infra" ? "brand" : "danger";
}

function sourceLabel(s: SyncRunRow["source"]): string {
  return s.type === "search" || s.type === "channelSearch"
    ? `busca "${s.query}"`
    : s.url.replace("https://www.youtube.com/", "");
}

/** Segundos até `iso` (atualiza a cada segundo); null se já passou. */
function useCountdown(iso: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!iso) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [iso]);
  if (!iso) return null;
  const s = Math.ceil((new Date(iso).getTime() - now) / 1000);
  return s > 0 ? s : null;
}

/** Diagnóstico: o que está errado AGORA e quem tem culpa — em português, com a ação. */
function Diagnosis({ state }: { state: PlayoutState }) {
  const h = state.health;
  const retryIn = useCountdown(h?.nextRetryAt);
  const last = h?.lastFailure;

  if (h?.status === "blocked") {
    return (
      <Alert
        className="mt-4"
        detail={
          <>
            docker compose -f infra/docker-compose.yml up -d --force-recreate mediamtx
          </>
        }
      >
        <strong className="font-medium text-fg">MediaMTX inacessível</strong> — {h.sinkFailures} falhas
        seguidas de publicação. O canal pausou a fila para não gastar vídeos
        {retryIn ? ` (nova tentativa em ${retryIn}s)` : ""}. Se persistir, recrie o container:
      </Alert>
    );
  }
  if (h?.status === "degraded" && h.sink === "down") {
    return (
      <Alert className="mt-4">
        <strong className="font-medium text-fg">Publicação instável</strong> — {h.sinkFailures}{" "}
        {h.sinkFailures === 1 ? "falha" : "falhas"} no MediaMTX
        {retryIn ? `, tentando de novo em ${retryIn}s` : ""}. O mesmo vídeo será repetido.
      </Alert>
    );
  }
  if (h?.status === "degraded") {
    return (
      <Alert className="mt-4">
        <strong className="font-medium text-fg">Vários vídeos seguidos falharam</strong> — o
        YouTube pode estar bloqueando este IP. O canal segue tentando outros vídeos.
      </Alert>
    );
  }
  if (state.lastError) {
    const info = last ? FAILURE_INFO[last.kind] : null;
    return (
      <Alert className="mt-4" detail={last ? last.message : state.lastError}>
        <strong className="font-medium text-fg">{info ? info.label : "Último erro de reprodução"}</strong>
        {last?.title ? ` · ${last.title}` : ""}
        {last?.attempt ? ` (tentativa ${last.attempt}/${last.maxAttempts})` : ""}
        {" — "}
        {info ? info.hint : "o canal segue com a fila."}
      </Alert>
    );
  }
  return null;
}

function Synthesis({ onPickKind }: { onPickKind: (k: FailureKind) => void }) {
  const { data: state } = usePlayoutState();
  const running = !!state?.running;
  const cur = state?.current;
  const counts = Object.entries(state?.health?.counts ?? {}).filter(([, n]) => n > 0) as [FailureKind, number][];
  const sinkDown = state?.health?.sink === "down";
  return (
    <Card padded className="mb-5">
      <div className="flex flex-wrap items-center gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-raised">
          <LogoMark className={running ? "h-7 w-7 text-brand" : "h-7 w-7 text-element"} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {running ? (
              <Pill tone="live" dot pulse>
                no ar
              </Pill>
            ) : (
              <Pill>parado</Pill>
            )}
            <span className="text-dim tnum">
              {state?.since && `sessão desde ${hhmm(state.since)} · `}
              {state?.errors ?? 0} erros · {state?.restarts ?? 0} reinícios
            </span>
          </div>
          <div className="mt-1 truncate text-sm font-medium">
            {cur ? cur.title : "Canal sem vídeo no ar"}
          </div>
          {state?.next && (
            <div className="truncate text-xs text-dim">a seguir: {state.next.title}</div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Pill tone={state?.workerOnline === false ? "danger" : "ok"} dot>
            worker {state?.workerOnline === false ? "offline" : "online"}
          </Pill>
          <Pill tone={sinkDown ? "danger" : "ok"} dot>
            MediaMTX {sinkDown ? "fora" : "ok"}
          </Pill>
          <Pill tone={state?.stale ? "danger" : "ok"} dot>
            publicação {state?.stale ? "atrasada" : "em dia"}
          </Pill>
        </div>
      </div>

      {state && <Diagnosis state={state} />}

      {counts.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-xs text-dim">
          <span>falhas desde o boot:</span>
          {counts.map(([kind, n]) => (
            <button
              key={kind}
              type="button"
              title={`${FAILURE_INFO[kind].hint} — ver no histórico`}
              onClick={() => onPickKind(kind)}
              className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
            >
              <Pill tone={failureTone(kind)}>
                {FAILURE_INFO[kind].label} · {n}
              </Pill>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

function Syncs({ take }: { take: number }) {
  const { data: runs } = useQuery({
    queryKey: ["sync-runs", take],
    queryFn: () => api.get<SyncRunRow[]>(`/sync/runs?take=${take}`),
    refetchInterval: 15000,
  });
  if (!runs) return <Spinner />;
  if (!runs.length)
    return (
      <Empty icon={RefreshCw} title="Nenhum sync ainda">
        Crie fontes em um gênero e sincronize para os vídeos chegarem.
      </Empty>
    );
  return (
    <ul className="divide-y divide-line">
      {runs.map((r) => (
        <li
          key={r.id}
          className="flex items-center gap-4 px-4 py-3 text-[13px] transition-colors hover:bg-raised/40"
        >
          <span className="w-24 shrink-0 text-dim tnum">{fmtWhen(r.startedAt)}</span>
          <span className="hidden w-40 shrink-0 items-center gap-2 text-sub md:flex">
            {r.source.genre ? (
              <>
                <GenreDot color={r.source.genre.color} />
                <span className="truncate">{r.source.genre.name}</span>
              </>
            ) : (
              "fonte"
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium">{sourceLabel(r.source)}</span>
            {r.message && <span className="text-dim"> — {r.message}</span>}
          </span>
          {r.errors > 0 ? (
            <Pill tone="danger">
              {r.errors} erro{r.errors === 1 ? "" : "s"}
            </Pill>
          ) : r.added > 0 ? (
            <Pill tone="brand">+{r.added}</Pill>
          ) : (
            <Pill>ok</Pill>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Filtro do histórico: "all" | "errors" | resultado base | "kind:<FailureKind>". */
function matches(h: HistoryRow, filter: string): boolean {
  if (filter === "all") return true;
  const { base, kind } = parseHistoryResult(h.result);
  if (filter === "errors") return base === "error";
  if (filter.startsWith("kind:")) return kind === filter.slice(5);
  return base === filter;
}

function HistorySummary({ rows }: { rows: HistoryRow[] }) {
  let ok = 0;
  let media = 0;
  let infra = 0;
  let legacy = 0; // erros de antes da classificação: sem causa registrada
  for (const h of rows) {
    const { base, kind } = parseHistoryResult(h.result);
    if (base === "success" || base === "fallback") ok += 1;
    else if (base === "error") {
      if (!kind) legacy += 1;
      else if (FAILURE_INFO[kind].blame === "infra") infra += 1;
      else media += 1;
    }
  }
  const total = ok + media + infra + legacy;
  if (!total) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-xs text-dim">
      <span>
        últimas {rows.length}: <span className="text-sub tnum">{ok}</span> ok
      </span>
      <span>
        <span className={media ? "text-danger tnum" : "text-sub tnum"}>{media}</span> falhas de vídeo
      </span>
      <span>
        <span className={infra ? "text-brand tnum" : "text-sub tnum"}>{infra}</span> de infraestrutura
        <span className="hidden sm:inline"> (poupam o vídeo)</span>
      </span>
      {legacy > 0 && (
        <span>
          <span className="text-sub tnum">{legacy}</span> sem causa registrada
        </span>
      )}
    </div>
  );
}

function Exibidos({ filter }: { filter: string }) {
  const { data: history } = useQuery({
    queryKey: ["history", "full"],
    queryFn: () => api.get<HistoryRow[]>("/playout/history?take=100"),
    refetchInterval: 15000,
  });
  if (!history) return <Spinner />;
  const rows = history.filter((h) => matches(h, filter));
  if (!rows.length)
    return (
      <Empty
        icon={History}
        title={filter === "all" ? "Nada exibido ainda" : "Nada com esse resultado"}
      />
    );
  return (
    <>
      <HistorySummary rows={history} />
      <ul className="divide-y divide-line">
        {rows.map((h) => {
          const { base, kind } = parseHistoryResult(h.result);
          const r = RESULT[base] ?? { tone: "muted" as PillTone, label: base };
          const info = kind ? FAILURE_INFO[kind] : null;
          return (
            <li
              key={h.id}
              className="flex items-center gap-4 px-4 py-2.5 text-[13px] transition-colors hover:bg-raised/40"
            >
              <span className="w-24 shrink-0 text-dim tnum">{fmtWhen(h.startedAt)}</span>
              <Thumb
                src={thumbOf(h.media)}
                fallback={h.media.source}
                className="hidden h-9 w-16 shrink-0 rounded sm:block"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{h.media.title}</span>
                {info && (
                  <span className="block truncate text-xs text-dim" title={info.hint}>
                    {info.blame === "infra" ? "infraestrutura — o vídeo não tem culpa" : info.hint}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-dim tnum">{fmtDur(h.duration)}</span>
              <Pill tone={info ? failureTone(kind) : r.tone}>{info ? info.label : r.label}</Pill>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Quarentena() {
  const { data: state } = usePlayoutState();
  const qc = useQueryClient();
  const toast = useToast();
  const release = useMutation({
    mutationFn: (mediaId?: string) => api.del(`/playout/quarantine${mediaId ? `/${mediaId}` : ""}`),
    onSuccess: (_d, mediaId) => {
      qc.invalidateQueries({ queryKey: ["playout-state"] });
      toast(mediaId ? "Vídeo devolvido à rotação" : "Quarentena esvaziada", { icon: Undo2 });
    },
  });
  if (!state) return <Spinner />;
  const rows = state.quarantine ?? [];
  if (!rows.length)
    return (
      <Empty icon={ShieldAlert} title="Nenhum vídeo em observação">
        Um vídeo que falha 3 vezes seguidas (já com novas tentativas) sai da rotação por 24 h. Nada é
        apagado — ele volta sozinho ou por aqui.
      </Empty>
    );
  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-xs text-dim">
        <span>
          Falhas de infraestrutura nunca entram aqui. A contagem zera quando o vídeo toca bem.
        </span>
        <Button size="sm" variant="ghost" loading={release.isPending} onClick={() => release.mutate(undefined)}>
          Liberar todos
        </Button>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((q) => (
          <li
            key={q.mediaId}
            className="flex items-center gap-4 px-4 py-2.5 text-[13px] transition-colors hover:bg-raised/40"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate">{q.title}</span>
              <span className="block truncate text-xs text-dim" title={FAILURE_INFO[q.kind].hint}>
                {FAILURE_INFO[q.kind].label} · {q.failures} {q.failures === 1 ? "falha" : "falhas"}
              </span>
            </span>
            {q.until ? (
              <Pill tone="danger">fora até {fmtWhen(q.until)}</Pill>
            ) : (
              <Pill>em observação</Pill>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={Undo2}
              loading={release.isPending && release.variables === q.mediaId}
              onClick={() => release.mutate(q.mediaId)}
            >
              Liberar
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

type TabId = "syncs" | "hist" | "quarentena";

export default function Atividade() {
  const { data: state } = usePlayoutState();
  const [tab, setTab] = useState<TabId>("syncs");
  const [take, setTake] = useState(30);
  const [filter, setFilter] = useState("all");
  const quarantined = state?.quarantine?.length ?? 0;

  const pickKind = (k: FailureKind) => {
    setFilter(`kind:${k}`);
    setTab("hist");
  };

  return (
    <div className="mx-auto max-w-5xl">
      <Synthesis onPickKind={pickKind} />
      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "syncs", label: "Sincronizações" },
          { id: "hist", label: "Exibidos" },
          { id: "quarentena", label: "Quarentena", count: quarantined || undefined },
        ]}
        aside={
          tab === "syncs" ? (
            <Dropdown
              align="right"
              value={String(take)}
              onSelect={(v) => setTake(Number(v))}
              options={[20, 30, 50, 100].map((n) => ({ value: String(n), label: `${n} recentes` }))}
            />
          ) : tab === "hist" ? (
            <Dropdown
              align="right"
              value={filter}
              onSelect={setFilter}
              options={[
                { value: "all", label: "Todos os resultados" },
                { value: "errors", label: "Todos os erros" },
                ...(Object.keys(FAILURE_INFO) as FailureKind[]).map((k) => ({
                  value: `kind:${k}`,
                  label: `Erro: ${FAILURE_INFO[k].label}`,
                })),
                { value: "success", label: "Ok" },
                { value: "skipped", label: "Pulados" },
              ]}
            />
          ) : undefined
        }
      />
      <Card key={tab} className="animate-fade-in overflow-hidden">
        {tab === "syncs" ? <Syncs take={take} /> : tab === "hist" ? <Exibidos filter={filter} /> : <Quarentena />}
      </Card>
    </div>
  );
}
