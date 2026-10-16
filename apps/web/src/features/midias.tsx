/** Mídias — biblioteca com busca, filtros, status e "colocar no ar". */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Search, Trash2 } from "lucide-react";
import { api, type MediaLite } from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Spinner, fmtDur, fmtWhen } from "../components/ui";

interface MediaPage {
  items: MediaLite[];
  total: number;
}

export default function Midias() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [take, setTake] = useState(60);

  const { data } = useQuery({
    queryKey: ["media", q, status, take],
    queryFn: () => api.get<MediaPage>(`/media?q=${encodeURIComponent(q)}&status=${status}&take=${take}`),
    refetchInterval: 20000,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["media"] });
  const toggle = useMutation({
    mutationFn: (m: MediaLite) => api.patch(`/media/${m.id}`, { status: m.status === "ativo" ? "inativo" : "ativo" }),
    onSuccess: invalidate,
  });
  const play = useMutation({ mutationFn: (m: MediaLite) => api.post(`/media/${m.id}/play`) });
  const del = useMutation({ mutationFn: (m: MediaLite) => api.del(`/media/${m.id}`), onSuccess: invalidate });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Biblioteca de mídias</h1>

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-2.5 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título…"
              className="w-72 pl-8"
            />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36">
            <option value="">todos os status</option>
            <option value="ativo">ativos</option>
            <option value="inativo">inativos</option>
          </select>
          <span className="text-xs text-muted">{data?.total ?? "…"} mídias</span>
        </div>
      </Card>

      {!data ? (
        <Spinner />
      ) : data.items.length === 0 ? (
        <Empty>Nada encontrado.</Empty>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Mídia</th>
                <th className="pb-2 font-medium">Origem</th>
                <th className="pb-2 font-medium">Duração</th>
                <th className="pb-2 font-medium">Cadastrada</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((m) => (
                <tr key={m.id} className="border-t border-muted/10">
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-2.5">
                      {m.thumbnailUrl ? (
                        <img src={m.thumbnailUrl} alt="" className="h-8 w-14 rounded object-cover" loading="lazy" />
                      ) : (
                        <div className="h-8 w-14 rounded bg-muted/10" />
                      )}
                      <div className="min-w-0">
                        <div className="line-clamp-1">{m.title}</div>
                        {m.channelTitle && <div className="text-[11px] text-muted">{m.channelTitle}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-xs text-muted">{m.source}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{fmtDur(m.duration)}</td>
                  <td className="py-2 pr-2 text-xs text-muted">{fmtWhen(m.createdAt)}</td>
                  <td className="py-2 pr-2">
                    <button onClick={() => toggle.mutate(m)} title="Alternar status">
                      {m.status === "ativo" ? <Badge tone="green">ativo</Badge> : <Badge tone="red">inativo</Badge>}
                    </button>
                  </td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Colocar no ar agora" onClick={() => play.mutate(m)}>
                        <Play size={14} className="text-signal" />
                      </Button>
                      <Button size="sm" variant="ghost" title="Excluir" onClick={() => del.mutate(m)}>
                        <Trash2 size={14} className="text-red-400" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length < data.total && (
            <div className="mt-3 text-center">
              <Button size="sm" onClick={() => setTake((t) => t + 60)}>
                Carregar mais ({data.total - data.items.length} restantes)
              </Button>
            </div>
          )}
        </Card>
      )}
      <ErrorMsg error={play.error} />
    </div>
  );
}
