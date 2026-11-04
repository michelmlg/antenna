/**
 * Bloco de programa na timeline — alças esq/dir (resize) + corpo (drag).
 * Selecionado: "acende" na cor do gênero e ganha um mini-menu (duplicar/excluir).
 */
import type React from "react";
import { Copy, Trash2 } from "lucide-react";
import type { ScheduleRow } from "../../lib/api";
import { alpha, readableOn } from "../../lib/color";
import { GenreIcon } from "../../lib/icons";
import { cn } from "../../components/ui";
import { durLabel, minutesToHHMM, toMin } from "./time";

export type ResizeMode = "move" | "left" | "right";

interface Props {
  row: ScheduleRow;
  px: number;
  selected: boolean;
  pending: boolean;
  onAir: boolean;
  onPick(e: React.PointerEvent, row: ScheduleRow, mode: ResizeMode): void;
  onPickUp(e: React.PointerEvent): void;
  onPickMove(e: React.PointerEvent): void;
  onDuplicate(row: ScheduleRow): void;
  onDelete(row: ScheduleRow): void;
}

const TOP = 5;
const HEIGHT = 54;

export function ScheduleBlock({
  row,
  px,
  selected,
  pending,
  onAir,
  onPick,
  onPickUp,
  onPickMove,
  onDuplicate,
  onDelete,
}: Props) {
  const start = toMin(row.startTime);
  const end = toMin(row.endTime);
  const width = Math.max(6, (end - start) * px - 2);
  const orphan = !row.program.genre; // gênero removido após apply de perfil
  const color = row.program.genre?.color;
  const narrow = width < 86;
  const tiny = width < 40;

  const style: React.CSSProperties = {
    left: start * px + 1,
    top: TOP,
    width,
    height: HEIGHT,
    ...(orphan
      ? {}
      : selected
        ? { background: color, color: readableOn(color) }
        : { background: alpha(color, 0.17), boxShadow: `inset 3px 0 0 ${color}` }),
  };

  const suffix = orphan
    ? " · gênero removido (cai na seleção automática)"
    : row.program.genre
      ? ` · ${row.program.genre.name}`
      : "";

  return (
    <div
      className={cn(
        "group absolute touch-none select-none rounded-md transition-[box-shadow,filter,background-color] duration-150",
        selected ? "z-[9] shadow-lg shadow-black/40" : "z-[5] hover:brightness-125",
        orphan && "border border-dashed border-danger/70 bg-raised",
        pending && "outline-dashed outline-2 outline-offset-2 outline-white/70",
      )}
      style={style}
      title={`${row.program.name} · ${row.startTime}–${row.endTime}${suffix}`}
      onPointerDown={(e) => onPick(e, row, "move")}
      onPointerUp={onPickUp}
      onPointerMove={onPickMove}
    >
      {/* alças de redimensionamento */}
      <span
        className="absolute inset-y-0 left-0 z-[6] w-2 cursor-ew-resize rounded-l-md after:absolute after:inset-y-3 after:left-[3px] after:w-0.5 after:rounded-full after:bg-white/0 after:transition-colors group-hover:after:bg-white/50"
        onPointerDown={(e) => onPick(e, row, "left")}
      />
      <span
        className="absolute inset-y-0 right-0 z-[6] w-2 cursor-ew-resize rounded-r-md after:absolute after:inset-y-3 after:right-[3px] after:w-0.5 after:rounded-full after:bg-white/0 after:transition-colors group-hover:after:bg-white/50"
        onPointerDown={(e) => onPick(e, row, "right")}
      />

      {!tiny && (
        <div
          className={cn(
            "flex h-full cursor-grab flex-col justify-center overflow-hidden px-2.5 active:cursor-grabbing",
          )}
        >
          <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium leading-tight">
            {!narrow && <GenreIcon name={row.program.genre?.icon} size={12} className="shrink-0" />}
            <span className="truncate">{row.program.name}</span>
            {onAir && (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded px-1 text-[9px] font-bold uppercase",
                  selected ? "bg-black/15" : "bg-live text-white",
                )}
              >
                <span className="h-1 w-1 animate-blink rounded-full bg-current" /> no ar
              </span>
            )}
          </div>
          {!narrow && (
            <div
              className={cn(
                "mt-0.5 truncate text-[10px] tnum",
                selected ? "opacity-75" : "text-sub",
              )}
            >
              {row.startTime}–{row.endTime} · {durLabel(end - start)}
            </div>
          )}
        </div>
      )}

      {/* mini-menu contextual — só no bloco selecionado */}
      {selected && (
        <div
          className="absolute -top-3 right-1 z-[10] flex animate-pop-in items-center gap-0.5 rounded-full border border-line bg-raised p-0.5 text-sub shadow-pop"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <MiniAction label="Duplicar (D)" onClick={() => onDuplicate(row)}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </MiniAction>
          <MiniAction label="Excluir (Del)" danger onClick={() => onDelete(row)}>
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </MiniAction>
        </div>
      )}
    </div>
  );
}

function MiniAction({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-full transition-[background-color,color,transform] duration-150 active:scale-90",
        danger ? "hover:bg-danger/15 hover:text-danger" : "hover:bg-element hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}

/** Fantasma de preview durante arraste/resize/drop da biblioteca. */
export function GhostBlock({
  start,
  end,
  valid,
  px,
}: {
  start: number;
  end: number;
  valid: boolean;
  px: number;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-[8] rounded-md border-2 border-dashed",
        valid ? "border-brand bg-brand/15" : "border-danger bg-danger/15",
      )}
      style={{
        left: start * px + 1,
        top: TOP,
        width: Math.max(6, (end - start) * px - 2),
        height: HEIGHT,
      }}
    >
      <div
        className={cn(
          "truncate px-2 pt-1 text-[11px] font-medium tnum",
          valid ? "text-brand" : "text-danger",
        )}
      >
        {valid ? `${minutesToHHMM(start)}–${minutesToHHMM(end)}` : "conflito"}
      </div>
    </div>
  );
}
