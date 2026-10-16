/** Detalhe do gênero — identidade, fontes (com filtros), mistura e simulador. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pause, Play, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react";
import { api, type GenreDetail, type SourceRow } from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Modal, Spinner, fmtWhen } from "../components/ui";
import { Mistura, Simulador } from "./genero-mistura";

const TYPE_LABEL: Record<string, string> = {
  channel: "📺 canal",
  search: "🔍 busca",
  channelSearch: "🔎 busca no canal",
  video: "🎬 vídeo",
};

export interface FiltersDraft {
  titleHas?: string;
  titleLacks?: string;
  minDur?: number | null;
  maxDur?: number | null;
  excludeShorts?: boolean;
  minViews?: number | null;
  maxViews?: number | null;
  excludeLive?: boolean;
  dateMode?: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  olderYears?: number | null;
  newerMonths?: number | null;
}

export function FiltersModal({ source, genreId, onClose }: { source: SourceRow; genreId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const f = (source.filters || {}) as FiltersDraft;
  const [d, setD] = useState<FiltersDraft>({
    titleHas: (f.titleHas as string[] | undefined)?.join(", ") || "",
    titleLacks: (f.titleLacks as string[] | undefined)?.join(", ") || "",
    minDur: f.minDur ?? null,
    maxDur: f.maxDur ?? null,
    excludeShorts: !!f.excludeShorts,
    minViews: f.minViews ?? null,
    maxViews: f.maxViews ?? null,
    excludeLive: !!f.excludeLive,
    dateMode: f.dateMode || "any",
    yearFrom: f.yearFrom ?? 2015,
    yearTo: f.yearTo ?? 2020,
    olderYears: f.olderYears ?? 10,
    newerMonths: f.newerMonths ?? 12,
  });

  const save = useMutation({
    mutationFn: () => {
      const list = (s?: string) => (s ? s.split(/[,;]/).map((x) => x.trim().toLowerCase()).filter(Boolean) : []);
      const any =
        !!d.titleHas || !!d.titleLacks || d.minDur || d.maxDur || d.excludeShorts || d.minViews || d.maxViews || d.excludeLive || d.dateMode !== "any";
      return api.put(`/genres/${genreId}/sources/${source.id}`, {
        filters: any
          ? {
              titleHas: list(d.titleHas),
              titleLacks: list(d.titleLacks),
              minDur: d.minDur || null,
              maxDur: d.maxDur || null,
              excludeShorts: d.excludeShorts,
              minViews: d.minViews || null,
              maxViews: d.maxViews || null,
              excludeLive: d.excludeLive,
              dateMode: d.dateMode,
              yearFrom: d.dateMode === "range" ? d.yearFrom : null,
              yearTo: d.dateMode === "range" ? d.yearTo : null,
              olderYears: d.dateMode === "older" ? d.olderYears : null,
              newerMonths: d.dateMode === "newer" ? d.newerMonths : null,
            }
          : null,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["genre", genreId] });
      onClose();
    },
  });

  const num = (v: string) => (v === "" ? null : Number(v));

  return (
    <Modal title="Filtros da fonte" onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Título contém (vírgulas)" hint="qualquer um dos termos">
            <input value={d.titleHas} onChange={(e) => setD({ ...d, titleHas: e.target.value })} className="w-full" />
          </Field>
          <Field label="Título NÃO contém">
            <input value={d.titleLacks} onChange={(e) => setD({ ...d, titleLacks: e.target.value })} className="w-full" />
          </Field>
          <Field label="Duração mín (min)">
            <input type="number" value={d.minDur ?? ""} onChange={(e) => setD({ ...d, minDur: num(e.target.value) })} />
          </Field>
          <Field label="Duração máx (min)">
            <input type="number" value={d.maxDur ?? ""} onChange={(e) => setD({ ...d, maxDur: num(e.target.value) })} />
          </Field>
          <Field label="Views mín">
            <input type="number" value={d.minViews ?? ""} onChange={(e) => setD({ ...d, minViews: num(e.target.value) })} />
          </Field>
          <Field label="Views máx">
            <input type="number" value={d.maxViews ?? ""} onChange={(e) => setD({ ...d, maxViews: num(e.target.value) })} />
          </Field>
        </div>
        <div className="flex gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.excludeShorts} onChange={(e) => setD({ ...d, excludeShorts: e.target.checked })} />
            excluir shorts (&lt;60s)
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={d.excludeLive} onChange={(e) => setD({ ...d, excludeLive: e.target.checked })} />
            excluir ao vivo
          </label>
        </div>
        <div className="grid grid-cols-3 items-end gap-3">
          <Field label="Data">
            <select value={d.dateMode} onChange={(e) => setD({ ...d, dateMode: e.target.value })}>
              <option value="any">qualquer</option>
              <option value="range">faixa de anos</option>
              <option value="older">mais antigo que</option>
              <option value="newer">mais novo que</option>
            </select>
          </Field>
          {d.dateMode === "range" && (
            <>
              <Field label="De">
                <input type="number" value={d.yearFrom ?? ""} onChange={(e) => setD({ ...d, yearFrom: num(e.target.value) })} />
              </Field>
              <Field label="Até">
                <input type="number" value={d.yearTo ?? ""} onChange={(e) => setD({ ...d, yearTo: num(e.target.value) })} />
              </Field>
            </>
          )}
          {d.dateMode === "older" && (
            <Field label="Anos">
              <input type="number" value={d.olderYears ?? ""} onChange={(e) => setD({ ...d, olderYears: num(e.target.value) })} />
            </Field>
          )}
          {d.dateMode === "newer" && (
            <Field label="Meses">
              <input type="number" value={d.newerMonths ?? ""} onChange={(e) => setD({ ...d, newerMonths: num(e.target.value) })} />
            </Field>
          )}
        </div>
        <p className="text-[11px] text-muted">Regra de ouro: dado faltando = passa (o filtro nunca derruba vídeo por falta de informação).</p>
        <ErrorMsg error={save.error} />
        <Button variant="signal" onClick={() => save.mutate()} disabled={save.isPending}>
          Salvar filtros
        </Button>
      </div>
    </Modal>
  );
}

function AddSource({ genreId }: { genreId: string }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"channel" | "search" | "channelSearch" | "video">("channel");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);

  const add = useMutation({
    mutationFn: () => api.post(`/genres/${genreId}/sources`, { type: kind, url, query, limit }),
    onSuccess: () => {
      setUrl("");
      setQuery("");
      qc.invalidateQueries({ queryKey: ["genre", genreId] });
    },
  });

  return (
    <Card className="mt-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Adicionar fonte</div>
      <div className="mb-3 flex gap-1.5">
        {(["channel", "search", "channelSearch", "video"] as const).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? "signal" : "default"} onClick={() => setKind(k)}>
            {TYPE_LABEL[k]}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {(kind === "channel" || kind === "channelSearch" || kind === "video") && (
          <Field label={kind === "video" ? "URL do vídeo" : "URL do canal"}>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/@canal"
              className="w-72"
            />
          </Field>
        )}
        {(kind === "search" || kind === "channelSearch") && (
          <Field label="Termo de busca">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rocket League" className="w-56" />
          </Field>
        )}
        {kind !== "video" && (
          <Field label="Limite/sync">
            <input type="number" min={1} max={50} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-20" />
          </Field>
        )}
        <ErrorMsg error={add.error} />
        <Button
          variant="signal"
          onClick={() => add.mutate()}
          disabled={add.isPending || (kind === "search" ? !query : !url)}
        >
          Adicionar
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted">
        Após adicionar, clique em ↻ na fonte para sincronizar (yt-dlp roda no worker; nada é baixado).
      </p>
    </Card>
  );
}

function SourceRowItem({ s, genreId }: { s: SourceRow; genreId: string }) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["genre", genreId] });

  const sync = useMutation({ mutationFn: () => api.post(`/genres/${genreId}/sources/${s.id}/sync`), onSuccess: invalidate });
  const toggle = useMutation({
    mutationFn: () => api.put(`/genres/${genreId}/sources/${s.id}`, { status: s.status === "ativo" ? "pausado" : "ativo" }),
    onSuccess: invalidate,
  });
  const del = useMutation({ mutationFn: () => api.del(`/genres/${genreId}/sources/${s.id}`), onSuccess: invalidate });

  const label = s.type === "search" || s.type === "channelSearch" ? s.query : s.url;

  return (
    <tr className="border-t border-muted/10 align-top">
      <td className="py-2 pr-2 text-xs">{TYPE_LABEL[s.type]}</td>
      <td className="py-2 pr-2">
        <div className="line-clamp-1 text-sm">{label}</div>
        <div className="text-[11px] text-muted">
          limite {s.limit} · {s.sort === "oldest" ? "mais antigos" : "recentes"} · último sync {fmtWhen(s.lastSyncAt)}
          {s.lastSyncCount > 0 && ` (+${s.lastSyncCount})`}
        </div>
        {s.lastError && <div className="text-[11px] text-red-400">⚠ {s.lastError}</div>}
      </td>
      <td className="py-2 pr-2">
        <div className="flex flex-wrap gap-1">
          {(s.filterChips || []).map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
        </div>
        {s.runs && s.runs[0] && <div className="mt-1 text-[11px] text-muted">↳ {s.runs[0].message}</div>}
      </td>
      <td className="py-2 pr-2">
        {s.status === "ativo" ? <Badge tone="green">ativo</Badge> : <Badge tone="red">pausado</Badge>}
      </td>
      <td className="py-2">
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" title="Sincronizar" onClick={() => sync.mutate()}>
            <RefreshCw size={14} className={sync.isPending ? "animate-spin text-signal" : ""} />
          </Button>
          <Button size="sm" variant="ghost" title="Filtros" onClick={() => setFilters(true)}>
            <SlidersHorizontal size={14} />
          </Button>
          <Button size="sm" variant="ghost" title={s.status === "ativo" ? "Pausar" : "Ativar"} onClick={() => toggle.mutate()}>
            {s.status === "ativo" ? <Pause size={14} /> : <Play size={14} />}
          </Button>
          <Button size="sm" variant="ghost" title="Remover fonte" onClick={() => del.mutate()}>
            <Trash2 size={14} className="text-red-400" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

export default function GeneroDetalhe() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data: g } = useQuery({
    queryKey: ["genre", id],
    queryFn: () => api.get<GenreDetail>(`/genres/${id}`),
    refetchInterval: 10000,
  });
  const del = useMutation({
    mutationFn: () => api.del(`/genres/${id}`),
    onSuccess: () => navigate("/generos"),
  });

  if (!g) return <Spinner />;
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/generos">
            <Button variant="ghost" size="sm">
              <ArrowLeft size={15} />
            </Button>
          </Link>
          <span className="text-2xl">{g.icon}</span>
          <h1 className="text-xl font-bold">{g.name}</h1>
          {g.status === "pausado" ? <Badge tone="red">pausado</Badge> : <Badge tone="green">ativo</Badge>}
        </div>
        <Button variant="danger" size="sm" onClick={() => del.mutate()} title="Excluir gênero (e o programa da grade)">
          <Trash2 size={14} /> Excluir
        </Button>
      </div>

      {/* fontes */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted">
            Fontes ({g.sources.length})
          </div>
        </div>
        {g.sources.length === 0 ? (
          <Empty>Nenhuma fonte — adicione canais ou buscas abaixo.</Empty>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="pb-2 pr-2 font-medium">Tipo</th>
                <th className="pb-2 pr-2 font-medium">Origem</th>
                <th className="pb-2 pr-2 font-medium">Filtros / último sync</th>
                <th className="pb-2 pr-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {g.sources.map((s) => (
                <SourceRowItem key={s.id} s={s} genreId={g.id} />
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <AddSource genreId={g.id} />

      <Mistura genre={g} />
      <Simulador genreId={g.id} />
    </div>
  );
}
