/**
 * Biblioteca em gaveta (abaixo da timeline): gêneros como cards arrastáveis
 * (dnd-kit) + busca. Recolher dá toda a altura útil para a timeline.
 */
import { useMemo, useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { ChevronDown, GripVertical, Search } from "lucide-react";
import type { GenreRow, ScheduleRow } from "../../lib/api";
import { fmtHours } from "../../lib/format";
import { useGenres } from "../../lib/queries";
import { GenreTile } from "../../components/GenreTile";
import { Card, Pill, Spinner, cn } from "../../components/ui";
import { hasOverlap, snapMinutes, toMin } from "./time";

/** Próxima janela livre do dia para soltar um bloco (procura do "start" em diante). */
export function firstFreeSlot(
  rows: ScheduleRow[],
  dow: number,
  durMin: number,
  preferStart: number,
): { start: number; end: number } | null {
  const start = Math.min(1440 - durMin, Math.max(0, snapMinutes(preferStart)));
  for (let s = start; s + durMin <= 1440; s += 5) {
    if (!hasOverlap(rows, dow, s, s + durMin)) return { start: s, end: s + durMin };
  }
  return null;
}

export function LibraryDrawer({
  open,
  onToggle,
  rows,
}: {
  open: boolean;
  onToggle: () => void;
  rows: ScheduleRow[];
}) {
  const [search, setSearch] = useState("");
  const { data: genres } = useGenres();

  const minutesByGenre = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const id = r.program.genre?.id;
      if (id) m.set(id, (m.get(id) ?? 0) + toMin(r.endTime) - toMin(r.startTime));
    }
    return m;
  }, [rows]);

  const filtered = (genres ?? []).filter(
    (g) => !search || g.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex items-center gap-2 rounded text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <ChevronDown
            className={cn(
              "h-4 w-4 text-dim transition-transform duration-200",
              !open && "-rotate-90",
            )}
            aria-hidden
          />
          Biblioteca
          <span className="hidden font-normal text-dim sm:inline">
            · arraste um gênero para a timeline
          </span>
        </button>
        <div className="relative ml-auto w-56">
          <Search
            className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-dim"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => !open && onToggle()}
            placeholder="Buscar gênero"
            aria-label="Buscar gênero na biblioteca"
            className="h-8 w-full pl-8"
          />
        </div>
      </div>
      {/* grid-rows 0fr↔1fr: recolhe com animação sem medir altura */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
            {!genres ? (
              <Spinner className="w-full py-4" />
            ) : filtered.length === 0 ? (
              <span className="py-2 text-[13px] text-dim">Nenhum gênero encontrado</span>
            ) : (
              filtered.map((g) => (
                <LibItem key={g.id} genre={g} minutes={minutesByGenre.get(g.id) ?? 0} />
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LibItem({ genre, minutes }: { genre: GenreRow; minutes: number }) {
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
      title={`${genre.name} — arraste para a grade`}
      className={cn(
        "group flex w-52 cursor-grab touch-none items-center gap-2.5 rounded-lg border border-line bg-raised/50 px-2.5 py-2",
        "transition-[border-color,background-color,transform,opacity] duration-150 hover:-translate-y-0.5 hover:border-element hover:bg-raised active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      style={{ boxShadow: `inset 3px 0 0 ${genre.color}` }}
    >
      <GenreTile icon={genre.icon} color={genre.color} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px]">{genre.name}</span>
        <span className="flex items-center gap-1.5 text-[11px] text-dim">
          {videos} vídeos · {fmtHours(minutes)}/sem
        </span>
      </span>
      {genre.status === "pausado" ? (
        <Pill tone="danger">pausado</Pill>
      ) : (
        <GripVertical
          className="h-3.5 w-3.5 shrink-0 text-dim transition-colors group-hover:text-sub"
          aria-hidden
        />
      )}
    </div>
  );
}
