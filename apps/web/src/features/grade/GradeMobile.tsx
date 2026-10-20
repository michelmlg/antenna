/** Versão celular da Grade: agenda de um dia com edição por campos de horário (sem drag). */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Empty, Spinner } from "../../components/ui";
import { GenreIcon } from "../../lib/icons";
import { api, type PlayoutState, type ScheduleRow } from "../../lib/api";
import { BlockModal, type ModalState } from "./BlockModal";
import { DOWS, durLabel, toMin } from "./time";
import { useGradeSchedule } from "./useScheduleMutations";

export default function GradeMobile() {
  const sched = useGradeSchedule();
  const { rows, updateBlock, addBlock, deleteBlock } = sched;
  const [dow, setDow] = useState(new Date().getDay());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});

  const { data: playout } = useQuery({
    queryKey: ["playout"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 15000,
  });
  const onAirProgramId = playout?.current?.programId ?? null;

  const dayRows = rows
    .filter((r) => r.dayOfWeek === dow)
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));

  async function edit(row: ScheduleRow, patch: { startTime?: string; endTime?: string }) {
    const start = patch.startTime ?? row.startTime;
    const end = patch.endTime ?? row.endTime;
    if (toMin(end) - toMin(start) < 5) {
      setErrs((e) => ({ ...e, [row.id]: "duração mínima de 5 min" }));
      return;
    }
    const result = await updateBlock(row.id, {
      dayOfWeek: row.dayOfWeek,
      startTime: start,
      endTime: end,
    });
    setErrs((e) => ({
      ...e,
      [row.id]:
        result === true
          ? ""
          : typeof result === "string" && result
            ? result
            : "conflito com outro bloco — restaurado",
    }));
  }

  const pill = sched.saving ? (
    <Badge tone="signal">salvando…</Badge>
  ) : sched.status.kind === "error" ? (
    <Badge tone="red">falhou (desfeito)</Badge>
  ) : sched.status.kind === "ok" ? (
    <Badge tone="green">salvo</Badge>
  ) : (
    <Badge tone="muted">sem alterações</Badge>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Grade</h1>
        {pill}
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {DOWS.map(([label], i) => (
          <Button
            key={label}
            size="sm"
            variant={dow === i ? "signal" : "default"}
            onClick={() => setDow(i)}
          >
            {label}
          </Button>
        ))}
      </div>

      {sched.isLoading ? (
        <Spinner />
      ) : (
        <Card className="space-y-2 p-3">
          {dayRows.length === 0 && <Empty>sem blocos neste dia — seleção automática</Empty>}
          {dayRows.map((r) => {
            const dur = toMin(r.endTime) - toMin(r.startTime);
            return (
              <div key={r.id} className="rounded border border-muted/10 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-background"
                    style={{ background: r.program.genre?.color || "#3b82f6" }}
                  >
                    <GenreIcon name={r.program.genre?.icon} size={12} /> {r.program.name}
                  </span>
                  {onAirProgramId === r.program.id ? <Badge tone="signal">no ar</Badge> : null}
                  <button
                    className="text-muted hover:text-danger"
                    title="Excluir bloco"
                    onClick={() => {
                      if (window.confirm(`Remover o bloco "${r.program.name}"?`))
                        void deleteBlock(r);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="time"
                    id={`m-blk-${r.id}-s`}
                    name={`m-blk-${r.id}-s`}
                    step={300}
                    defaultValue={r.startTime}
                    key={r.id + "-s"}
                    onChange={(e) => void edit(r, { startTime: e.target.value })}
                    className="w-24"
                  />
                  <span className="text-muted">–</span>
                  <input
                    type="time"
                    id={`m-blk-${r.id}-e`}
                    name={`m-blk-${r.id}-e`}
                    step={300}
                    defaultValue={r.endTime}
                    key={r.id + "-e"}
                    onChange={(e) => void edit(r, { endTime: e.target.value })}
                    className="w-24"
                  />
                  <span className="ml-auto text-xs text-muted">{dur > 0 ? durLabel(dur) : ""}</span>
                </div>
                {errs[r.id] && <div className="mt-1 text-xs text-danger">⚠ {errs[r.id]}</div>}
              </div>
            );
          })}
          <Button
            variant="signal"
            className="w-full"
            onClick={() => setModal({ mode: "create", dow })}
          >
            <span className="flex items-center gap-1.5">
              <Plus size={14} /> Novo bloco
            </span>
          </Button>
        </Card>
      )}

      {modal && (
        <BlockModal
          state={modal}
          rows={rows}
          onClose={() => setModal(null)}
          onCreate={addBlock}
          onEdit={updateBlock}
        />
      )}
    </div>
  );
}
