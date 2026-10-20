/** Operação — estado do worker, histórico completo, syncs. */
import { useQuery } from "@tanstack/react-query";
import { api, type HistoryRow, type PlayoutState, type SyncRunRow } from "../lib/api";
import { Badge, Card, ErrorMsg, Spinner, fmtDur, fmtWhen } from "../components/ui";

export default function Operacao() {
  const { data: state } = useQuery({
    queryKey: ["playout-state"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 5000,
  });
  const { data: history } = useQuery({
    queryKey: ["history-full"],
    queryFn: () => api.get<HistoryRow[]>("/playout/history?take=100"),
    refetchInterval: 15000,
  });
  const { data: runs } = useQuery({
    queryKey: ["sync-runs"],
    queryFn: () => api.get<SyncRunRow[]>("/sync/runs?take=30"),
    refetchInterval: 15000,
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Operação do canal</h1>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Estado
          </div>
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">playout</dt>
              <dd>
                {state?.running ? <Badge tone="signal">rodando</Badge> : <Badge>parado</Badge>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">worker</dt>
              <dd>
                {state?.workerOnline ? (
                  <Badge tone="green">online</Badge>
                ) : (
                  <Badge tone="red">offline</Badge>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">publicação</dt>
              <dd>
                {state?.stale ? (
                  <Badge tone="red">atrasada</Badge>
                ) : (
                  <Badge tone="green">fresca</Badge>
                )}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">no ar</dt>
              <dd className="max-w-48 truncate">{state?.current?.title ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">erros / restarts</dt>
              <dd>
                {state?.errors ?? 0} / {state?.restarts ?? 0}
              </dd>
            </div>
          </dl>
          {state?.lastError && (
            <p className="mt-3 break-words rounded border border-danger/30 bg-danger/5 p-2 text-[11px] text-danger">
              último erro: {state.lastError}
            </p>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Syncs recentes
          </div>
          {!runs ? (
            <Spinner />
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted">nenhum sync ainda</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-muted/10">
                    <td className="py-1.5 pr-2 font-mono text-[11px] text-muted">
                      {fmtWhen(r.startedAt)}
                    </td>
                    <td className="py-1.5 pr-2">
                      {r.source.genre && <Badge>{r.source.genre.name}</Badge>}{" "}
                      <span className="text-xs text-muted">
                        {r.source.type === "search" || r.source.type === "channelSearch"
                          ? r.source.query
                          : r.source.url}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-xs">{r.message}</td>
                    <td className="py-1.5 text-right">
                      {r.errors > 0 ? (
                        <Badge tone="red">{r.errors} erros</Badge>
                      ) : r.added > 0 ? (
                        <Badge tone="green">+{r.added}</Badge>
                      ) : (
                        <Badge>ok</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Histórico de reprodução
        </div>
        {!history ? (
          <Spinner />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Início</th>
                <th className="pb-2 font-medium">Mídia</th>
                <th className="pb-2 font-medium">Duração exibida</th>
                <th className="pb-2 font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-muted/10">
                  <td className="py-1.5 pr-2 font-mono text-xs text-muted">
                    {fmtWhen(h.startedAt)}
                  </td>
                  <td className="line-clamp-1 py-1.5 pr-2">{h.media.title}</td>
                  <td className="py-1.5 pr-2 font-mono text-xs">{fmtDur(h.duration)}</td>
                  <td className="py-1.5">
                    {h.result === "success" && <Badge tone="green">ok</Badge>}
                    {h.result === "playing" && <Badge tone="signal">no ar</Badge>}
                    {h.result === "error" && <Badge tone="red">erro</Badge>}
                    {h.result === "stopped" && <Badge>parado</Badge>}
                    {h.result === "fallback" && <Badge>fallback</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <ErrorMsg error={null} />
      </Card>
    </div>
  );
}
