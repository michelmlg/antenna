/** Biblioteca lateral: gêneros (GET /genres), pesquisa, LARGURA AJUSTÁVEL. Arrastar cria o bloco. */
import { useMemo, useState } from "react";

import { useDraggable } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { api, type GenreRow, type ScheduleRow } from "../../lib/api";
import { GenreIcon } from "../../lib/icons";
import { Badge, Button, Empty, Spinner } from "../../components/ui";
import { hasOverlap, snapMinutes, toMin } from "@antenna/core/schedule";

const LIB_W_KEY = "grade-lib-w";
const LIB_MIN = 150;
const LIB_MAX = 360;

/** Próxima janela livre do dia para soltar um bloco (procura do "start" em diante). */
export function firstFreeSlot(
  rows: ScheduleRow[],
  dow: number,
  durMin: number,
  preferStart: number
): { start: number; end: number } | null {
  const sorted = rows
    .filter((r) => r.dayOfWeek === dow)
    .map((r) => [toMin(r.startTime), toMin(r.endTime)] as const)
    .sort((a, b) => a[0] - b[0]);
  const start = Math.min(1440 - durMin, Math.max(0, snapMinutes(preferStart - durMin / 2)));
  for (let s = start; s + durMin <= 1440; s += 5) {
    let clash = false;
    for (const [bs, be] of sorted) {
      if (s < be && bs < s + durMin) {
        s = be - 5; // pula depois do bloco em conflito e continua
        clash = true;
        break;
      }
    }
    if (!clash) return { start: s, end: s + durMin };
  }
  return null;
}

interface Props {
  open: boolean;
  onToggle(): void;
  onNewBlock(): void;
}

export function LibraryPanel({ open, onToggle, onNewBlock }: Props) {
  const [search, setSearch] = useState("");
  const [width, setWidth] = useState(() => {
    const v = parseInt(localStorage.getItem(LIB_W_KEY) || "", 10);
    return Number.isFinite(v) ? Math.min(LIB_MAX, Math.max(LIB_MIN, v)) : 208;
  });
  const { data: genres } = useQuery({ queryKey: ["genres"], queryFn: () => api.get<GenreRow[]>("/genres") });

  const filtered = useMemo(() => {
    return (genres ?? []).filter((g) => !search || g.name.toLowerCase().includes(search.toLowerCase()));
  }, [genres, search]);

  return (
    <aside
      className={`relative flex shrink-0 flex-col rounded-lg border border-muted/10 bg-card transition-colors`}
      style={{ width: open ? width : 36 }}
    >
      {/* alça de redimensionamento (borda direita) */}
      {open && (
        <div
          className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize hover:bg-signal/40"
          title="Arraste para ajustar a largura"
          onPointerDown={(e) => {
            e.preventDefault();
            const parent = (e.currentTarget as HTMLElement).parentElement;
            if (!parent) return;
            const onMove = (ev: PointerEvent) => {
              setWidth(Math.min(LIB_MAX, Math.max(LIB_MIN, ev.clientX - parent.getBoundingClientRect().left)));
            };
            const onUp = () => {
              document.removeEventListener("pointermove", onMove, true);
              document.removeEventListener("pointerup", onUp, true);
              setWidth((w) => {
                localStorage.setItem(LIB_W_KEY, String(w));
                return w;
              });
            };
            document.addEventListener("pointermove", onMove, true);
            document.addEventListener("pointerup", onUp, true);
          }}
        />
      )}
      <div className="flex items-center justify-between p-1.5">
        {open && <span className="px-1 text-[11px] font-bold uppercase tracking-wide text-muted">Biblioteca</span>}
        <Button size="sm" variant="ghost" onClick={onToggle} title={open ? "Recolher" : "Expandir biblioteca"}>
          {open ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
        </Button>
      </div>
      {!open ? null : (
        <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-2.5 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="buscar gênero…"
              className="w-full rounded border border-muted/20 bg-background py-1.5 pl-7 pr-2 text-xs"
            />
          </div>
          <div className="mt-2 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
            {!genres ? (
              <Spinner />
            ) : filtered.length === 0 ? (
              <Empty>Nenhum gênero.</Empty>
            ) : (
              filtered.map((g) => <LibItem key={g.id} genre={g} />)
            )}
          </div>
          <div className="mt-2 border-t border-muted/10 pt-2">
            <Button size="sm" variant="default" className="w-full" onClick={onNewBlock}>
              <span className="flex items-center gap-1">
                <Plus size={12} /> Novo bloco
              </span>
            </Button>
          </div>
          <div className="mt-1 text-center text-[10px] text-muted italic">arraste → timeline</div>
        </div>
      )}
    </aside>
  );
}

function LibItem({ genre }: { genre: GenreRow }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `lib-${genre.id}`,
    data: { kind: "library", genre },
  });
  const videos = genre.expandedCount + genre.linkCount;
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`group cursor-grab touch-none rounded border border-muted/10 px-2 py-1.5 ${
        isDragging ? "opacity-40" : ""
      }`}
      style={{ borderLeft: `3px solid ${genre.color}` }}
      title={`${genre.name} — arraste para a grade`}
    >
      <div className="flex items-center gap-1.5">
        <GenreIcon name={genre.icon} size={12} />
        <span className="truncate text-xs font-medium">{genre.name}</span>
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted">
        <span className="truncate">{videos} vídeo{videos === 1 ? "" : "s"}</span>
        {genre.status === "pausado" ? <Badge tone="red">pausado</Badge> : <Badge tone="muted">auto</Badge>}
      </div>
    </div>
  );
}
