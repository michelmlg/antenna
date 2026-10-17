/** Trilha de um dia da semana: label fixa à esquerda + eixo do dia em minutos. */
import { useDroppable } from "@dnd-kit/core";
import { minutesToHHMM } from "./time";
import type { ScheduleRow } from "../../lib/api";
import { GhostBlock, ScheduleBlock, type ResizeMode } from "./ScheduleBlock";
import { LANE_H } from "./time";
import type React from "react";

export interface Preview {
  dow: number;
  start: number;
  end: number;
  valid: boolean;
}

interface Props {
  dow: number;
  name: string;
  px: number;
  blocks: ScheduleRow[];
  today: boolean;
  nowMin: number | null; // null → linha "agora" fora
  onAirProgramId: string | null;
  selectedId: string | null;
  pendingIds: Set<string>;
  preview: Preview | null;
  hourPx: number;
  registerTrack: (dow: number, el: HTMLDivElement | null) => void;
  onPick: (e: React.PointerEvent, row: ScheduleRow, mode: ResizeMode) => void;
  onPickMove: (e: React.PointerEvent) => void;
  onPickUp: (e: React.PointerEvent) => void;
  onOpen: (row: ScheduleRow) => void;
}

export function DayLane({
  dow,
  name,
  px,
  blocks,
  today,
  nowMin,
  onAirProgramId,
  selectedId,
  pendingIds,
  preview,
  hourPx,
  registerTrack,
  onPick,
  onPickMove,
  onPickUp,
  onOpen,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${dow}` });

  const gridStyle: React.CSSProperties = {
    width: 1440 * px,
    height: LANE_H,
    backgroundImage:
      px >= 1.5
        ? "repeating-linear-gradient(to right, rgba(255,255,255,0.06) 0 1px, transparent 1px var(--hour-px)), repeating-linear-gradient(to right, rgba(255,255,255,0.025) 0 1px, transparent 1px calc(var(--hour-px) / 2))"
        : "repeating-linear-gradient(to right, rgba(255,255,255,0.06) 0 1px, transparent 1px var(--hour-px))",
    ["--hour-px" as string]: `${hourPx}px`,
  };

  return (
    <div className="flex border-b border-muted/10" style={{ height: LANE_H }}>
      <div
        className={`sticky left-0 z-20 flex w-16 shrink-0 items-center justify-end border-r ${
          today ? "border-signal/60 bg-signal/10" : "border-muted/20 bg-surface"
        } pr-2`}
      >
        <span className={`text-xs font-semibold uppercase tracking-wide ${today ? "text-signal" : "text-muted"}`}>{name}</span>
      </div>
      <div
        ref={(el) => {
          setNodeRef(el);
          registerTrack(dow, el);
        }}
        className={`relative touch-none ${isOver && preview ? "bg-white/[0.03]" : ""}`}
        style={gridStyle}
      >
        {blocks.length === 0 && (
          <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-muted italic">
            {today && nowMin !== null ? "" : "livre (auto)"}
          </span>
        )}
        {blocks.map((r) => (
          <ScheduleBlock
            key={r.id}
            row={r}
            px={px}
            selected={selectedId === r.id}
            pending={pendingIds.has(r.id)}
            onAir={!!onAirProgramId && onAirProgramId === r.program.id}
            onPick={onPick}
            onPickUp={onPickUp}
            onPickMove={onPickMove}
            onOpen={onOpen}
          />
        ))}
        {preview && preview.dow === dow && (
          <GhostBlock dow={dow} start={preview.start} end={preview.end} valid={preview.valid} px={px} />
        )}
        {today && nowMin !== null && (
          <div
            className="pointer-events-none absolute top-0 z-[7] w-0.5 bg-signal"
            style={{ left: (nowMin / 60) * hourPx, height: LANE_H }}
            title={`agora ${minutesToHHMM(nowMin)}`}
          />
        )}
      </div>
    </div>
  );
}
