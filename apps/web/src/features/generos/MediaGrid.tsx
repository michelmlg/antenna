/** Grade de miniaturas de vídeos (sincronizados de uma fonte, ou links manuais). */
import { useState } from "react";
import { Trash2 } from "lucide-react";
import type { MediaLite } from "../../lib/api";
import { fmtDur } from "../../lib/format";
import { Thumb, thumbOf } from "../../components/Thumb";
import { IconButton, Pill, cn } from "../../components/ui";

export function MediaCard({
  m,
  onDelete,
  deleteLabel = "Apagar de vez",
  isNew,
}: {
  m: MediaLite;
  onDelete?: () => void;
  deleteLabel?: string;
  isNew?: boolean;
}) {
  return (
    <div className={cn("group animate-fade-in", m.status === "inativo" && "opacity-45")}>
      <div className="relative aspect-video overflow-hidden rounded-md bg-raised">
        <Thumb
          src={thumbOf(m)}
          fallback={m.source}
          className="h-full w-full transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] text-white tnum">
          {fmtDur(m.duration)}
        </span>
        {isNew && (
          <span className="absolute left-1 top-1 rounded bg-brand px-1 text-[10px] font-semibold text-brand-ink">
            novo
          </span>
        )}
        {onDelete && (
          <IconButton
            icon={Trash2}
            label={deleteLabel}
            tone="onMedia"
            size="sm"
            onClick={onDelete}
            className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-md:opacity-100"
          />
        )}
      </div>
      <div className="mt-1.5 line-clamp-2 text-xs leading-snug text-sub transition-colors group-hover:text-fg">
        {m.title}
      </div>
      {m.status === "inativo" && <Pill className="mt-1">inativo</Pill>}
    </div>
  );
}

/** Lista paginada no cliente ("Ver mais"). */
export function MediaGrid({
  items,
  onDelete,
  deleteLabel,
  newestCount = 0,
  pageSize = 12,
}: {
  items: MediaLite[];
  onDelete?: (m: MediaLite) => void;
  deleteLabel?: string;
  /** os N primeiros recebem o selo "novo" (último sync) */
  newestCount?: number;
  pageSize?: number;
}) {
  const [take, setTake] = useState(pageSize);
  const visible = items.slice(0, take);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {visible.map((m, i) => (
          <MediaCard
            key={m.id}
            m={m}
            isNew={i < newestCount}
            deleteLabel={deleteLabel}
            onDelete={onDelete ? () => onDelete(m) : undefined}
          />
        ))}
      </div>
      {items.length > take && (
        <div className="mt-3 flex items-center justify-between text-xs text-dim">
          <span className="tnum">
            Mostrando {visible.length} de {items.length}
          </span>
          <button
            type="button"
            onClick={() => setTake((t) => t + pageSize)}
            className="rounded transition-colors hover:text-fg"
          >
            Ver mais
          </button>
        </div>
      )}
    </>
  );
}
