/**
 * Fontes do gênero: barra de adição (canal/busca/vídeo manual), bloco por fonte
 * com CRUD de vídeos (grid de thumbs), busca dentro do canal e filtros por fonte.
 * Busca dentro do canal = coluna query da fonte — o sync lista a página de busca
 * do canal (playout/sync.ts). Filtros pós-listagem aplicam no sync e na seleção.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  MonitorPlay,
  Pause,
  Play,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { api, type MediaLite, type SourceRow } from "../lib/api";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorMsg,
  Field,
  Modal,
  Spinner,
  fmtDur,
} from "../components/ui";

// ---------- helpers ----------
export function thumbOfMedia(m: {
  thumbnailUrl: string | null;
  resolvedId?: string | null;
}): string | null {
  if (m.thumbnailUrl) return m.thumbnailUrl;
  if (m.resolvedId) return `https://i.ytimg.com/vi/${m.resolvedId}/mqdefault.jpg`;
  return null;
}

/** Rótulo da fonte na mistura/simulador — canal com busca aparece como "busca". */
export function sourceLabelOf(s: Pick<SourceRow, "type" | "url" | "query">): string {
  if (s.type === "search") return `busca "${s.query}"`;
  return (
    s.url.replace("https://www.youtube.com/", "").replace(/\/(videos|search)$/i, "") || "vídeo"
  );
}

/** busca interna aceita em canal (e no tipo legado channelSearch) */
export const hasChannelQuery = (s: { type: string; query: string }): boolean =>
  s.type === "channel" || s.type === "channelSearch";

// ---------- grid de vídeos (CRUD inline) ----------
function MediaCard({ m, onDelete }: { m: MediaLite & { status: string }; onDelete?: () => void }) {
  const thumb = thumbOfMedia(m);
  const [broken, setBroken] = useState(false);
  const showImg = thumb && !broken;
  return (
    <div
      className={`group relative overflow-hidden rounded border border-muted/10 bg-background/40 ${m.status === "inativo" ? "opacity-45" : ""}`}
    >
      {showImg ? (
        <img
          src={thumb}
          alt=""
          loading="lazy"
          onError={() => setBroken(true)}
          className="aspect-video w-full object-cover"
        />
      ) : (
        <div className="flex aspect-video items-center justify-center bg-muted/10 text-[10px] text-muted">
          {m.source}
        </div>
      )}
      <div className="p-1.5">
        <div className="line-clamp-2 text-[11px] leading-tight">{m.title}</div>
        <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
          <span>{fmtDur(m.duration)}</span>
          {m.status === "inativo" && <Badge tone="red">inativo</Badge>}
        </div>
      </div>
      {/* ação no hover: apagar de vez */}
      <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/70 opacity-0 transition-opacity group-hover:opacity-100">
        {onDelete && (
          <Button
            size="sm"
            variant="danger"
            onClick={onDelete}
            title="Apagar de vez (o vídeo sai da biblioteca)"
          >
            <Trash2 size={13} />
          </Button>
        )}
      </div>
    </div>
  );
}

export function SourceMediaGrid({
  genreId,
  sid,
  manual,
}: {
  genreId: string;
  sid: string;
  manual?: (MediaLite & { itemId: string })[];
}) {
  const qc = useQueryClient();
  const [take, setTake] = useState(12);
  const { data } = useQuery({
    queryKey: ["source-media", genreId, sid],
    queryFn: () =>
      api.get<{ items: (MediaLite & { status: string })[] }>(
        `/genres/${genreId}/sources/${sid}/media`,
      ),
    enabled: !manual,
  });

  const delMedia = useMutation({
    mutationFn: (m: MediaLite) => api.del(`/media/${m.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["source-media"] });
      qc.invalidateQueries({ queryKey: ["genre"] });
    },
  });
  // manual: "apagar de vez" remove o link E o vídeo (sem a tela Mídias, não há outro caminho)
  const delManual = useMutation({
    mutationFn: (m: MediaLite & { itemId: string }) =>
      api.del(`/genres/${genreId}/links/${m.itemId}`).then(() => api.del(`/media/${m.id}`)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["genre"] }),
  });

  if (manual) {
    if (!manual.length) return null;
    const withItem = manual.map((m) => ({ ...m, status: m.status ?? "ativo" }));
    return (
      <div className="px-3 pb-3 pt-1">
        <div className="mb-1.5 text-[11px] font-medium text-muted">
          Adicionados manualmente ({withItem.length})
        </div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
          {withItem.map((m) => (
            <MediaCard
              key={m.id}
              m={m}
              onDelete={() => {
                if (
                  window.confirm(`Apagar "${m.title}" de vez? O link e o vídeo saem da biblioteca.`)
                )
                  delManual.mutate(m);
              }}
            />
          ))}
        </div>
        <ErrorMsg error={delManual.error} />
      </div>
    );
  }

  if (!data) return <Spinner />;
  const items = data.items;
  const visible = items.slice(0, take);
  const activeCount = items.filter((m) => m.status === "ativo").length;

  return (
    <div className="px-3 pb-3 pt-1">
      <div className="mb-1.5 text-[11px] text-muted tnum">
        {activeCount} ativos de {items.length} nesta fonte
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
        {visible.map((m) => (
          <MediaCard
            key={m.id}
            m={m}
            onDelete={() => {
              if (
                window.confirm(
                  `Apagar "${m.title}" de vez? O vídeo sai da biblioteca (a fonte para de listá-lo).`,
                )
              )
                delMedia.mutate(m);
            }}
          />
        ))}
      </div>
      <ErrorMsg error={delMedia.error} />
      {items.length > take && (
        <div className="mt-2 text-center">
          <Button size="sm" onClick={() => setTake((t) => t + 12)}>
            Ver mais ({items.length - take} restantes)
          </Button>
        </div>
      )}
      {items.length === 0 && <Empty>nenhum vídeo ainda — clique em ↻ na fonte</Empty>}
    </div>
  );
}

// ---------- editor de filtros ----------
interface FiltersDraft {
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

const DATE_MODES: [string, string][] = [
  ["any", "qualquer"],
  ["range", "faixa de anos"],
  ["older", "mais antigo que"],
  ["newer", "mais novo que"],
];

export function FiltersModal({
  source,
  genreId,
  onClose,
}: {
  source: SourceRow;
  genreId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const f = (source.filters || {}) as FiltersDraft;
  const isChannel = hasChannelQuery(source);
  const savedCount = (source.filterChips || []).length;
  const [query, setQuery] = useState(source.query);
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
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const list = (s?: string) =>
        s
          ? s
              .split(/[,;]/)
              .map((x) => x.trim().toLowerCase())
              .filter(Boolean)
          : [];
      const any =
        !!d.titleHas ||
        !!d.titleLacks ||
        d.minDur ||
        d.maxDur ||
        d.excludeShorts ||
        d.minViews ||
        d.maxViews ||
        d.excludeLive ||
        d.dateMode !== "any";
      return api.put(`/genres/${genreId}/sources/${source.id}`, {
        // canal guarda a busca na própria fonte (o sync lista a aba de busca do canal)
        ...(isChannel ? { query: query.trim() } : {}),
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  const num = (v: string) => (v === "" ? null : Number(v));
  const sectionLabel = "text-[11px] font-semibold text-muted";
  const anyFilter = savedCount > 0 || !!query.trim();

  return (
    <Modal title="Filtros da fonte" onClose={onClose}>
      <div className="space-y-1">
        <div className="flex items-center justify-between pb-1">
          <div className="min-w-0 truncate text-xs text-muted">
            {sourceLabelOf(source)}
            {anyFilter && <span className="tnum"> · {anyFilter} filtro(s) ativo(s)</span>}
          </div>
        </div>

        {/* busca no canal — só faz sentido em fontes de canal */}
        {isChannel && (
          <div className="rounded-lg border border-muted/10 bg-background/40 p-3">
            <div className={sectionLabel}>Busca dentro do canal</div>
            <div className="mt-1.5">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="termo de busca — vazio traz o canal inteiro"
                className="w-full"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">
              ao sincronizar, entra na página de busca do canal em vez dos uploads recentes
            </p>
          </div>
        )}

        {/* título */}
        <div className="rounded-lg border border-muted/10 bg-background/40 p-3">
          <div className={sectionLabel}>Título</div>
          <div className="mt-2 grid gap-3">
            <Field label="Título contém" hint="qualquer um dos termos, separados por vírgula">
              <input
                value={d.titleHas}
                onChange={(e) => setD({ ...d, titleHas: e.target.value })}
                placeholder="plantio, aquascape"
                className="w-full"
              />
            </Field>
            <Field label="Título não contém" hint="descarta se contiver qualquer dos termos">
              <input
                value={d.titleLacks}
                onChange={(e) => setD({ ...d, titleLacks: e.target.value })}
                className="w-full"
              />
            </Field>
          </div>
        </div>

        {/* duração + views */}
        <div className="rounded-lg border border-muted/10 bg-background/40 p-3">
          <div className={sectionLabel}>Duração e views</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <Field label="Duração mín (min)">
              <input
                type="number"
                value={d.minDur ?? ""}
                onChange={(e) => setD({ ...d, minDur: num(e.target.value) })}
              />
            </Field>
            <Field label="Duração máx (min)">
              <input
                type="number"
                value={d.maxDur ?? ""}
                onChange={(e) => setD({ ...d, maxDur: num(e.target.value) })}
              />
            </Field>
            <Field label="Views mín">
              <input
                type="number"
                value={d.minViews ?? ""}
                onChange={(e) => setD({ ...d, minViews: num(e.target.value) })}
              />
            </Field>
            <Field label="Views máx">
              <input
                type="number"
                value={d.maxViews ?? ""}
                onChange={(e) => setD({ ...d, maxViews: num(e.target.value) })}
              />
            </Field>
          </div>
        </div>

        {/* cortes rápidos */}
        <div className="rounded-lg border border-muted/10 bg-background/40 p-3">
          <div className={sectionLabel}>Cortes</div>
          <div className="mt-2 flex gap-5 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={d.excludeShorts}
                onChange={(e) => setD({ ...d, excludeShorts: e.target.checked })}
              />
              excluir shorts (&lt;60s)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={d.excludeLive}
                onChange={(e) => setD({ ...d, excludeLive: e.target.checked })}
              />
              excluir ao vivo
            </label>
          </div>
        </div>

        {/* data */}
        <div className="rounded-lg border border-muted/10 bg-background/40 p-3">
          <div className={sectionLabel}>Data de publicação</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {DATE_MODES.map(([k, label]) => (
              <Button
                key={k}
                size="sm"
                variant={d.dateMode === k ? "signal" : "default"}
                onClick={() => setD({ ...d, dateMode: k })}
              >
                {label}
              </Button>
            ))}
          </div>
          {d.dateMode === "range" && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="De (ano)">
                <input
                  type="number"
                  value={d.yearFrom ?? ""}
                  onChange={(e) => setD({ ...d, yearFrom: num(e.target.value) })}
                />
              </Field>
              <Field label="Até (ano)">
                <input
                  type="number"
                  value={d.yearTo ?? ""}
                  onChange={(e) => setD({ ...d, yearTo: num(e.target.value) })}
                />
              </Field>
            </div>
          )}
          {d.dateMode === "older" && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="Mais antigo que (anos)">
                <input
                  type="number"
                  value={d.olderYears ?? ""}
                  onChange={(e) => setD({ ...d, olderYears: num(e.target.value) })}
                />
              </Field>
            </div>
          )}
          {d.dateMode === "newer" && (
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Field label="Mais novo que (meses)">
                <input
                  type="number"
                  value={d.newerMonths ?? ""}
                  onChange={(e) => setD({ ...d, newerMonths: num(e.target.value) })}
                />
              </Field>
            </div>
          )}
        </div>

        <p className="pt-1 text-[11px] text-muted">
          Regra de ouro: dado faltando = passa (o filtro nunca derruba vídeo por falta de
          informação). Filtros valem nos syncs novos e na seleção do ar.
        </p>
        <ErrorMsg error={save.error} />
        <div className="flex justify-end gap-2 pt-1">
          {saved && (
            <span className="flex items-center text-[11px] text-emerald-400">
              <Check size={12} /> salvo
            </span>
          )}
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
          <Button variant="signal" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "salvando…" : "Salvar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- bloco de uma fonte ----------
const TYPE_ICON: Record<string, typeof MonitorPlay> = {
  channel: MonitorPlay,
  search: Search,
  channelSearch: Search,
  video: MonitorPlay,
};

export function SourceBlock({
  s,
  genreId,
  open,
  onToggleOpen,
}: {
  s: SourceRow;
  genreId: string;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["genre", genreId] });

  const sync = useMutation({
    mutationFn: () => api.post(`/genres/${genreId}/sources/${s.id}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["source-media", genreId, s.id] });
      invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: () =>
      api.put(`/genres/${genreId}/sources/${s.id}`, {
        status: s.status === "ativo" ? "pausado" : "ativo",
      }),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: () => api.del(`/genres/${genreId}/sources/${s.id}`),
    onSuccess: invalidate,
  });

  const Icon = TYPE_ICON[s.type] ?? MonitorPlay;
  const inChannelSearch = hasChannelQuery(s) && !!s.query;

  return (
    <div className="rounded-lg border border-muted/10 bg-surface">
      <div className="flex flex-wrap items-center gap-2 p-3">
        <button onClick={onToggleOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {open ? (
            <ChevronDown size={16} className="shrink-0 text-muted" />
          ) : (
            <ChevronRight size={16} className="shrink-0 text-muted" />
          )}
          <Icon size={16} className="shrink-0 text-signal" />
          <span className="line-clamp-1 text-sm font-medium">{sourceLabelOf(s)}</span>
          {inChannelSearch && <Badge tone="signal">busca "{s.query}"</Badge>}
          <span className="shrink-0 text-[11px] text-muted tnum">
            limite {s.limit} · {s.sort === "oldest" ? "mais antigos" : "recentes"} · último sync{" "}
            {s.lastSyncAt
              ? new Date(s.lastSyncAt).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "nunca"}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {s.status === "ativo" ? (
            <Badge tone="green">ativo</Badge>
          ) : (
            <Badge tone="red">pausado</Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            title="Sincronizar esta fonte"
            onClick={() => sync.mutate()}
          >
            <RefreshCw size={14} className={sync.isPending ? "animate-spin text-signal" : ""} />
          </Button>
          <Button size="sm" variant="ghost" title="Filtros" onClick={() => setFilters(true)}>
            <SlidersHorizontal size={14} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title={s.status === "ativo" ? "Pausar fonte" : "Ativar fonte"}
            onClick={() => toggle.mutate()}
          >
            {s.status === "ativo" ? <Pause size={14} /> : <Play size={14} />}
          </Button>
          <Button size="sm" variant="ghost" title="Remover fonte" onClick={() => del.mutate()}>
            <Trash2 size={14} className="text-danger" />
          </Button>
        </div>
      </div>

      {(s.filterChips || []).length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {(s.filterChips || []).map((c) => (
            <Badge key={c}>{c}</Badge>
          ))}
        </div>
      )}
      {s.lastError && (
        <div className="px-3 pb-2">
          <div className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-danger">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{s.lastError}</span>
          </div>
        </div>
      )}

      {open && <SourceMediaGrid genreId={genreId} sid={s.id} />}
      {filters && <FiltersModal source={s} genreId={genreId} onClose={() => setFilters(false)} />}
    </div>
  );
}

// ---------- barra de adicionar fonte (em cima) ----------
export function AddSourceBar({ genreId }: { genreId: string }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"channel" | "search" | "video">("channel");
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
    <Card>
      <div className="mb-3 text-[11px] font-semibold text-muted">Adicionar fonte</div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(
          [
            ["channel", "Canal", MonitorPlay],
            ["search", "Busca", Search],
            ["video", "Vídeo (manual)", MonitorPlay],
          ] as const
        ).map(([k, label, I]) => (
          <Button
            key={k}
            size="sm"
            variant={kind === k ? "signal" : "default"}
            onClick={() => setKind(k)}
          >
            <span className="flex items-center gap-1.5">
              <I size={13} /> {label}
            </span>
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {kind === "channel" && (
          <Field label="URL do canal">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.youtube.com/@canal"
              className="w-80"
            />
          </Field>
        )}
        {(kind === "search" || kind === "video") && (
          <Field label={kind === "video" ? "URL do vídeo" : "Termo de busca"}>
            <input
              value={kind === "video" ? url : query}
              onChange={(e) =>
                kind === "video" ? setUrl(e.target.value) : setQuery(e.target.value)
              }
              placeholder={kind === "video" ? "https://www.youtube.com/watch?v=…" : "Rocket League"}
              className="w-80"
            />
          </Field>
        )}
        {kind !== "video" && (
          <Field label="Limite por sync">
            <input
              type="number"
              min={1}
              max={50}
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-20"
            />
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
        Depois de adicionar, use ↻ na fonte para sincronizar. Para restringir o que entra de um
        canal — incluindo busca dentro dele — use os filtros (⚙/≡) na linha da fonte.
      </p>
    </Card>
  );
}
