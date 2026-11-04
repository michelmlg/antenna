/**
 * Aba Fontes: adicionar canal/busca e gerenciar cada fonte — expandir mostra os
 * vídeos sincronizados (miniaturas), o botão de filtros abre o painel inline.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  MonitorPlay,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Youtube,
} from "lucide-react";
import { api, type GenreDetail, type MediaLite, type SourceRow } from "../../lib/api";
import { fmtWhen, plural } from "../../lib/format";
import {
  Button,
  Card,
  Empty,
  ErrorMsg,
  Field,
  IconButton,
  Pill,
  Segmented,
  Spinner,
  TextAction,
  cn,
  useToast,
} from "../../components/ui";
import { FiltersPanel } from "./filtros";
import { MediaGrid } from "./MediaGrid";
import { hasChannelQuery, sourceLabelOf } from "./shared";

function AddSource({ genreId }: { genreId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<"channel" | "search">("channel");
  const [value, setValue] = useState("");
  const [limit, setLimit] = useState(12);

  const add = useMutation({
    mutationFn: () =>
      api.post(`/genres/${genreId}/sources`, {
        type: kind,
        url: kind === "channel" ? value.trim() : "",
        query: kind === "search" ? value.trim() : "",
        limit,
      }),
    onSuccess: () => {
      setValue("");
      qc.invalidateQueries({ queryKey: ["genre", genreId] });
      toast("Fonte adicionada · sincronize para trazer vídeos");
    },
  });

  return (
    <Card padded>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) add.mutate();
        }}
      >
        <div>
          <span className="mb-1.5 block text-[13px] text-sub">Adicionar fonte</span>
          <Segmented
            ariaLabel="Tipo de fonte"
            value={kind}
            onChange={setKind}
            options={[
              { value: "channel", label: "Canal", icon: Youtube },
              { value: "search", label: "Busca", icon: Search },
            ]}
          />
        </div>
        <Field
          label={kind === "channel" ? "URL do canal" : "Termo de busca"}
          className="min-w-[220px] flex-1"
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={
              kind === "channel" ? "https://www.youtube.com/@canal" : "ex.: aquário plantado"
            }
            className="w-full"
          />
        </Field>
        <Field label="Limite por sync" className="w-28">
          <input
            type="number"
            min={1}
            max={50}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </Field>
        <Button
          type="submit"
          variant="primary"
          icon={Plus}
          loading={add.isPending}
          disabled={!value.trim()}
        >
          Adicionar
        </Button>
      </form>
      <ErrorMsg error={add.error} className="mt-3" />
    </Card>
  );
}

function SourceVideos({ genreId, source }: { genreId: string; source: SourceRow }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({
    queryKey: ["source-media", genreId, source.id],
    queryFn: () => api.get<{ items: MediaLite[] }>(`/genres/${genreId}/sources/${source.id}/media`),
  });
  const del = useMutation({
    mutationFn: (m: MediaLite) => api.del(`/media/${m.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["source-media"] });
      qc.invalidateQueries({ queryKey: ["genre"] });
      toast("Vídeo apagado");
    },
  });

  return (
    <div className="animate-fade-in border-t border-line bg-base/40 px-4 py-4">
      {!data ? (
        <Spinner className="py-6" />
      ) : data.items.length === 0 ? (
        <Empty title="Nenhum vídeo ainda" className="py-6">
          Clique em sincronizar na fonte para trazer os vídeos.
        </Empty>
      ) : (
        <>
          <p className="mb-3 text-xs text-dim tnum">
            {data.items.filter((m) => m.status === "ativo").length} ativos de {data.items.length}{" "}
            nesta fonte
          </p>
          <MediaGrid
            items={data.items}
            newestCount={source.lastSyncCount}
            deleteLabel="Apagar de vez (sai da biblioteca)"
            onDelete={(m) => {
              if (window.confirm(`Apagar "${m.title}" de vez? A fonte para de listá-lo.`))
                del.mutate(m);
            }}
          />
        </>
      )}
      <ErrorMsg error={del.error} className="mt-3" />
    </div>
  );
}

function SourceItem({
  s,
  genreId,
  open,
  onToggle,
}: {
  s: SourceRow;
  genreId: string;
  open: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [filters, setFilters] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ["genre", genreId] });
  const label = sourceLabelOf(s);

  const sync = useMutation({
    mutationFn: () => api.post(`/genres/${genreId}/sources/${s.id}/sync`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["source-media", genreId, s.id] });
      invalidate();
      toast(`${label} sincronizado`);
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
    onSuccess: () => {
      invalidate();
      toast("Fonte removida");
    },
  });

  const filterCount = (s.filterChips || []).length;
  const inChannelSearch = hasChannelQuery(s) && !!s.query;
  const Icon =
    s.type === "search" || s.type === "channelSearch"
      ? Search
      : s.type === "channel"
        ? Youtube
        : MonitorPlay;
  const paused = s.status !== "ativo";

  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          title="Ver vídeos sincronizados"
          className="flex min-w-0 flex-1 items-center gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-dim transition-transform duration-200",
              open && "rotate-90",
            )}
            aria-hidden
          />
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-raised text-sub">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <span className={cn("min-w-0 flex-1", paused && "opacity-60")}>
            <span className="flex items-center gap-2">
              <span className="truncate text-sm font-medium">{label}</span>
              {inChannelSearch && <Pill tone="brand">busca "{s.query}"</Pill>}
              {filterCount > 0 && (
                <Pill tone="brand">{plural(filterCount, "filtro", "filtros")}</Pill>
              )}
            </span>
            <span className="block truncate text-xs text-dim">
              limite {s.limit} · {s.sort === "oldest" ? "mais antigos" : "mais recentes"} · sync{" "}
              {s.lastSyncAt ? fmtWhen(s.lastSyncAt) : "nunca"}
            </span>
          </span>
        </button>
        <Pill tone={paused ? "muted" : "ok"} className="hidden sm:inline-flex">
          {paused ? "pausada" : "ativa"}
        </Pill>
        <div className="flex items-center">
          <IconButton
            icon={RefreshCw}
            label="Sincronizar esta fonte"
            spin={sync.isPending}
            disabled={sync.isPending}
            onClick={() => sync.mutate()}
          />
          <IconButton
            icon={SlidersHorizontal}
            label="Filtros"
            active={filters}
            onClick={() => setFilters((v) => !v)}
          />
          <IconButton
            icon={paused ? Play : Pause}
            label={paused ? "Ativar fonte" : "Pausar fonte"}
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          />
          <IconButton
            icon={Trash2}
            label="Remover fonte"
            tone="danger"
            onClick={() => window.confirm(`Remover a fonte "${label}"?`) && del.mutate()}
          />
        </div>
      </div>

      {(filterCount > 0 || s.lastError) && (
        <div className="space-y-2 px-4 pb-3 pl-[76px]">
          {filterCount > 0 && (
            <div className="flex flex-wrap gap-1">
              {(s.filterChips || []).map((c) => (
                <Pill key={c}>{c}</Pill>
              ))}
            </div>
          )}
          {s.lastError && <ErrorMsg error={s.lastError} />}
        </div>
      )}
      <ErrorMsg error={sync.error || del.error} className="mx-4 mb-3" />

      {open && <SourceVideos genreId={genreId} source={s} />}
      {filters && <FiltersPanel source={s} genreId={genreId} onClose={() => setFilters(false)} />}
    </li>
  );
}

export function FontesTab({ genre }: { genre: GenreDetail }) {
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const allOpen = genre.sources.length > 0 && openIds.size === genre.sources.length;

  return (
    <div className="space-y-5">
      <AddSource genreId={genre.id} />
      <div>
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[13px] text-sub">Fontes</span>
          {genre.sources.length > 0 && (
            <TextAction
              onClick={() =>
                setOpenIds(allOpen ? new Set() : new Set(genre.sources.map((s) => s.id)))
              }
            >
              {allOpen ? "Recolher tudo" : "Expandir tudo"}
            </TextAction>
          )}
        </div>
        {genre.sources.length === 0 ? (
          <Card>
            <Empty icon={Youtube} title="Nenhuma fonte ainda">
              Adicione canais do YouTube ou buscas acima. Vídeos avulsos ficam em Links manuais.
            </Empty>
          </Card>
        ) : (
          <Card>
            <ul className="divide-y divide-line">
              {genre.sources.map((s) => (
                <SourceItem
                  key={s.id}
                  s={s}
                  genreId={genre.id}
                  open={openIds.has(s.id)}
                  onToggle={() =>
                    setOpenIds((cur) => {
                      const next = new Set(cur);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
