/**
 * Atividade — síntese do canal em cima (no ar, saúde, erro ativo) e, em abas,
 * as sincronizações recentes e o histórico de exibição.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History, RefreshCw } from "lucide-react";
import { api, type HistoryRow, type SyncRunRow } from "../lib/api";
import { fmtDur, fmtWhen, hhmm } from "../lib/format";
import { usePlayoutState } from "../lib/queries";
import { GenreDot } from "../components/GenreTile";
import { Thumb, thumbOf } from "../components/Thumb";
import { Alert, Card, Dropdown, Empty, Pill, Spinner, Tabs, type PillTone } from "../components/ui";
import { LogoMark } from "../components/Logo";

const RESULT: Record<string, { tone: PillTone; label: string }> = {
  success: { tone: "muted", label: "ok" },
  playing: { tone: "live", label: "no ar" },
  error: { tone: "danger", label: "erro" },
  stopped: { tone: "muted", label: "parado" },
  skipped: { tone: "brand", label: "pulou" },
  fallback: { tone: "muted", label: "reserva" },
};

function sourceLabel(s: SyncRunRow["source"]): string {
  return s.type === "search" || s.type === "channelSearch"
    ? `busca "${s.query}"`
    : s.url.replace("https://www.youtube.com/", "");
}

function Synthesis() {
  const { data: state } = usePlayoutState();
  const running = !!state?.running;
  const cur = state?.current;
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
          <Pill tone={state?.stale ? "danger" : "ok"} dot>
            publicação {state?.stale ? "atrasada" : "em dia"}
          </Pill>
        </div>
      </div>
      {state?.lastError && (
        <Alert detail={state.lastError} className="mt-4">
          Último erro de reprodução — o canal segue com a fila.
        </Alert>
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

function Exibidos({ filter }: { filter: string }) {
  const { data: history } = useQuery({
    queryKey: ["history-full"],
    queryFn: () => api.get<HistoryRow[]>("/playout/history?take=100"),
    refetchInterval: 15000,
  });
  if (!history) return <Spinner />;
  const rows = history.filter((h) => filter === "all" || h.result === filter);
  if (!rows.length)
    return (
      <Empty
        icon={History}
        title={filter === "all" ? "Nada exibido ainda" : "Nada com esse resultado"}
      />
    );
  return (
    <ul className="divide-y divide-line">
      {rows.map((h) => {
        const r = RESULT[h.result] ?? { tone: "muted" as PillTone, label: h.result };
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
            <span className="min-w-0 flex-1 truncate">{h.media.title}</span>
            <span className="shrink-0 text-dim tnum">{fmtDur(h.duration)}</span>
            <Pill tone={r.tone}>{r.label}</Pill>
          </li>
        );
      })}
    </ul>
  );
}

export default function Atividade() {
  const [tab, setTab] = useState<"syncs" | "hist">("syncs");
  const [take, setTake] = useState(30);
  const [filter, setFilter] = useState("all");

  return (
    <div className="mx-auto max-w-5xl">
      <Synthesis />
      <Tabs
        className="mb-4"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "syncs", label: "Sincronizações" },
          { id: "hist", label: "Exibidos" },
        ]}
        aside={
          tab === "syncs" ? (
            <Dropdown
              align="right"
              value={String(take)}
              onSelect={(v) => setTake(Number(v))}
              options={[20, 30, 50, 100].map((n) => ({ value: String(n), label: `${n} recentes` }))}
            />
          ) : (
            <Dropdown
              align="right"
              value={filter}
              onSelect={setFilter}
              options={[
                { value: "all", label: "Todos os resultados" },
                { value: "error", label: "Só erros" },
                { value: "success", label: "Ok" },
                { value: "skipped", label: "Pulados" },
              ]}
            />
          )
        }
      />
      <Card key={tab} className="animate-fade-in overflow-hidden">
        {tab === "syncs" ? <Syncs take={take} /> : <Exibidos filter={filter} />}
      </Card>
    </div>
  );
}
