/** Bloco de programa na timeline — alças esq/dir (resize) + corpo (drag). */
import type React from "react";
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
}

const CANVAS = "#00000055";

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
}: Props) {
  const start = toMin(row.startTime);
  const end = toMin(row.endTime);
  const width = Math.max(6, (end - start) * px - 2);
  const color = row.program.genre?.color || "#3b82f6";
  const narrow = width < 86;
  const tiny = width < 44;

  const bodyStyle: React.CSSProperties = {
    position: "absolute",
    left: start * px,
    top: 5,
    width,
    height: 54,
    background: `linear-gradient(180deg, rgba(255,255,255,0.16), rgba(0,0,0,0.10)), ${color}`,
    boxShadow: selected
      ? "0 0 0 2.5px #ffffffdd, 0 4px 10px #0007"
      : `0 0 0 1px ${CANVAS}, 0 2px 6px #0006`,
    cursor: narrow ? "grab" : undefined,
    ...(pending ? { outline: "2px dashed #ffffffcc", outlineOffset: 2 } : {}),
  } as React.CSSProperties;

  return (
    <div
      className="group absolute z-[5] rounded-md text-white select-none touch-none"
      style={bodyStyle}
      title={`${row.program.name} · ${row.startTime}–${row.endTime}${row.program.genre ? ` · ${row.program.genre.name}` : ""}`}
      onPointerDown={(e) => onPick(e, row, "move")}
      onPointerUp={onPickUp}
      onPointerMove={onPickMove}
      onDoubleClick={() => onOpen(row)}
    >
      {/* alças de redimensionamento */}
      <span
        className="absolute inset-y-0 left-0 z-[6] w-1.5 cursor-ew-resize rounded-l-md bg-white/0 group-hover:bg-white/40"
        onPointerDown={(e) => onPick(e, row, "left")}
      />
      <span
        className="absolute inset-y-0 right-0 z-[6] w-1.5 cursor-ew-resize rounded-r-md bg-white/0 group-hover:bg-white/40"
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
              <span className="ml-0.5 shrink-0 rounded bg-white/25 px-1 text-[9px]">no ar</span>
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
              {row.program.genre ? ` · ${row.program.genre.name}` : ""}
            </div>
          )}
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
      className={`pointer-events-none absolute z-[8] rounded-md border-2 ${
        valid ? "border-signal bg-signal/15" : "border-danger bg-danger/20"
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
