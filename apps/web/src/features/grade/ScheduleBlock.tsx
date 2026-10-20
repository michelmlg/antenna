/** Bloco de programa na timeline — alças esq/dir (resize) + corpo (drag). */
import type React from "react";
import { Copy, Trash2 } from "lucide-react";
import { minutesToHHMM, toMin } from "./time";
import type { ScheduleRow } from "../../lib/api";
import { durLabel } from "./time";

export type ResizeMode = "move" | "left" | "right";

interface Props {
  row: ScheduleRow;
  px: number;
  selected: boolean;
  pending: boolean;
  onAir: boolean;
  onPick(e: React.PointerEvent, row: ScheduleRow, mode: ResizeMode): void;
  onOpen(row: ScheduleRow): void; // duplo-clique
  onPickUp(e: React.PointerEvent): void;
  onPickMove(e: React.PointerEvent): void;
  onDuplicate(row: ScheduleRow): void;
  onDelete(row: ScheduleRow): void;
}

const CANVAS = "#00000055";
const ORPHAN_BG =
  "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.12)), rgba(163,163,163,0.22)";

export function ScheduleBlock({
  row,
  px,
  selected,
  pending,
  onAir,
  onPick,
  onOpen,
  onPickUp,
  onPickMove,
  onDuplicate,
  onDelete,
}: Props) {
  const start = toMin(row.startTime);
  const end = toMin(row.endTime);
  const width = Math.max(6, (end - start) * px - 2);
  const orphan = !row.program.genre; // gênero removido após apply de perfil
  const color = row.program.genre?.color || "#3b82f6";
  const narrow = width < 86;
  const tiny = width < 44;

  const bodyStyle: React.CSSProperties = {
    position: "absolute",
    left: start * px,
    top: 5,
    width,
    height: 54,
    background: orphan
      ? ORPHAN_BG
      : `linear-gradient(180deg, rgba(255,255,255,0.16), rgba(0,0,0,0.10)), ${color}`,
    boxShadow: selected
      ? "0 0 0 2.5px #ffffffdd, 0 4px 10px #0007"
      : `0 0 0 1px ${CANVAS}, 0 2px 6px #0006`,
    cursor: narrow ? "grab" : undefined,
    ...(pending ? { outline: "2px dashed #ffffffcc", outlineOffset: 2 } : {}),
  } as React.CSSProperties;

  const suffix = orphan
    ? " · gênero removido (cai na seleção automática)"
    : row.program.genre
      ? ` · ${row.program.genre.name}`
      : "";

  return (
    <div
      className={`group absolute z-[5] rounded-lg text-white select-none touch-none transition-shadow ${
        orphan ? "border border-dashed border-danger/70" : ""
      }`}
      style={bodyStyle}
      title={`${row.program.name} · ${row.startTime}–${row.endTime}${suffix}`}
      onPointerDown={(e) => onPick(e, row, "move")}
      onPointerUp={onPickUp}
      onPointerMove={onPickMove}
      onDoubleClick={() => onOpen(row)}
    >
      {/* alças de redimensionamento */}
      <span
        className="absolute inset-y-0 left-0 z-[6] w-1.5 cursor-ew-resize rounded-l-lg bg-white/0 transition-colors group-hover:bg-white/50"
        onPointerDown={(e) => onPick(e, row, "left")}
      />
      <span
        className="absolute inset-y-0 right-0 z-[6] w-1.5 cursor-ew-resize rounded-r-lg bg-white/0 transition-colors group-hover:bg-white/50"
        onPointerDown={(e) => onPick(e, row, "right")}
      />
      {!tiny && (
        <div
          className={
            "flex h-full flex-col px-2 pt-1 overflow-hidden " + (narrow ? "justify-center" : "")
          }
        >
          <div className="flex items-center gap-1 text-[11px] font-semibold leading-tight truncate">
            {row.program.name}
            {onAir && (
              <span className="ml-0.5 flex shrink-0 items-center gap-0.5 rounded bg-white/25 px-1 text-[9px] font-bold uppercase">
                <span className="h-1 w-1 animate-pulse rounded-full bg-white" /> no ar
              </span>
            )}
          </div>
          {!narrow && (
            <div className="mt-0.5 font-mono text-[10px] opacity-85">
              {row.startTime}–{row.endTime}
            </div>
          )}
          {!narrow && (
            <div className="text-[10px] opacity-75">
              {durLabel(end - start)}
              {suffix}
            </div>
          )}
        </div>
      )}
      {/* mini-ações contextuais — só no bloco selecionado (descobribilidade; edição é na grade) */}
      {selected && (
        <div className="absolute -top-2.5 right-1 z-[9] flex gap-0.5">
          <button
            className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-muted shadow-md shadow-black/30 hover:bg-muted/30 hover:text-foreground"
            title="Duplicar (D)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate(row);
            }}
          >
            <Copy size={10} />
          </button>
          <button
            className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-muted shadow-md shadow-black/30 hover:bg-danger/20 hover:text-danger"
            title="Excluir (Del)"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(row);
            }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      )}
    </div>
  );
}

/** Fantasma de preview durante arraste/resize/drop da biblioteca. */
export function GhostBlock({
  dow,
  start,
  end,
  valid,
  px,
}: {
  dow: number;
  start: number;
  end: number;
  valid: boolean;
  px: number;
}) {
  void dow;
  return (
    <div
      className={`pointer-events-none absolute z-[8] rounded-lg border-2 ${
        valid
          ? "border-signal bg-signal/15 shadow-sm shadow-signal/10"
          : "border-danger bg-danger/20"
      }`}
      style={{ left: start * px, top: 5, width: Math.max(6, (end - start) * px - 2), height: 54 }}
    >
      <div
        className={`truncate px-2 pt-1 text-[11px] font-mono ${valid ? "text-signal" : "text-danger"}`}
      >
        {valid ? `${minutesToHHMM(start)}–${minutesToHHMM(end)}` : "conflito"}
      </div>
    </div>
  );
}
