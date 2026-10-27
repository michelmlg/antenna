/** Trilha de um dia da semana: rótulo fixo à esquerda + eixo do dia em minutos. */
import type React from "react";
import { useDroppable } from "@dnd-kit/core";
import type { ScheduleRow } from "../../lib/api";
import { cn } from "../../components/ui";
import { GhostBlock, ScheduleBlock, type ResizeMode } from "./ScheduleBlock";
import { LABEL_W, LANE_H, minutesToHHMM } from "./time";

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
  hourPx: number;
  blocks: ScheduleRow[];
  today: boolean;
  nowMin: number | null; // null → linha "agora" fora
  onAirBlockId: string | null; // só o bloco em execução (não todos do gênero)
  guideMin: number | null; // guia vertical do drag da biblioteca (minuto do snap)
  selectedId: string | null;
  pendingIds: Set<string>;
  preview: Preview | null;
  registerTrack: (dow: number, el: HTMLDivElement | null) => void;
  onPick: (e: React.PointerEvent, row: ScheduleRow, mode: ResizeMode) => void;
  onPickMove: (e: React.PointerEvent) => void;
  onPickUp: (e: React.PointerEvent) => void;
  onDuplicate: (row: ScheduleRow) => void;
  onDelete: (row: ScheduleRow) => void;
}

export function DayLane({
  dow,
  name,
  px,
  hourPx,
  blocks,
  today,
  nowMin,
  onAirBlockId,
  guideMin,
  selectedId,
  pendingIds,
  preview,
  registerTrack,
  onPick,
  onPickMove,
  onPickUp,
  onDuplicate,
  onDelete,
}: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: `lane-${dow}` });

  // grade de horas (e meias-horas com zoom alto) desenhada no fundo da trilha
  const gridStyle: React.CSSProperties = {
    width: 1440 * px,
    height: LANE_H,
    backgroundImage:
      px >= 1.5
        ? "repeating-linear-gradient(to right, rgba(255,255,255,0.05) 0 1px, transparent 1px var(--hour-px)), repeating-linear-gradient(to right, rgba(255,255,255,0.02) 0 1px, transparent 1px calc(var(--hour-px) / 2))"
        : "repeating-linear-gradient(to right, rgba(255,255,255,0.05) 0 1px, transparent 1px var(--hour-px))",
    ["--hour-px" as string]: `${hourPx}px`,
  };

  return (
    <div
      className={cn("flex border-b border-line last:border-b-0", today && "bg-brand/[0.03]")}
      style={{ height: LANE_H }}
    >
      <div
        className="sticky left-0 z-20 flex shrink-0 flex-col justify-center border-r border-line bg-panel px-4"
        style={{ width: LABEL_W }}
      >
        <span className={cn("text-[13px]", today ? "font-medium text-brand" : "text-sub")}>
          {name}
        </span>
        {today && <span className="text-[10px] text-brand/80">hoje</span>}
      </div>
      <div
        ref={(el) => {
          setNodeRef(el);
          registerTrack(dow, el);
        }}
        className={cn(
          "relative touch-none transition-colors duration-150",
          isOver && preview && "bg-brand/[0.05]",
        )}
        style={gridStyle}
      >
        {blocks.length === 0 && !(today && nowMin !== null) && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[11px] italic text-dim">
            livre — seleção automática
          </span>
        )}
        {blocks.map((r) => (
          <ScheduleBlock
            key={r.id}
            row={r}
            px={px}
            selected={selectedId === r.id}
            pending={pendingIds.has(r.id)}
            onAir={onAirBlockId === r.id}
            onPick={onPick}
            onPickUp={onPickUp}
            onPickMove={onPickMove}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        ))}
        {guideMin !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-[3] w-px bg-brand/40"
            style={{ left: guideMin * px }}
          />
        )}
        {preview && preview.dow === dow && (
          <GhostBlock start={preview.start} end={preview.end} valid={preview.valid} px={px} />
        )}
        {today && nowMin !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 z-[7] w-0.5 bg-brand"
            style={{ left: (nowMin / 60) * hourPx }}
            title={`agora ${minutesToHHMM(nowMin)}`}
          >
            <i className="absolute -left-[3px] -top-0.5 h-2 w-2 rounded-full bg-brand" />
          </div>
        )}
      </div>
    </div>
  );
}
