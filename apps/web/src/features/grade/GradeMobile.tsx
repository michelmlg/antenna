/** Versão celular da Grade: agenda de um dia com edição por campos de horário (sem drag). */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ScheduleRow } from "../../lib/api";
import { usePlayoutState } from "../../lib/queries";
import { GenreTile } from "../../components/GenreTile";
import { Button, Card, Empty, IconButton, Pill, Spinner, cn, useToast } from "../../components/ui";
import { BlockModal, type ModalState } from "./BlockModal";
import { DISPLAY_ORDER, DOWS, durLabel, toMin } from "./time";
import { useGradeSchedule } from "./useScheduleMutations";

export default function GradeMobile() {
  const toast = useToast();
  const sched = useGradeSchedule();
  const { rows, updateBlock, addBlock, deleteBlock } = sched;
  const [dow, setDow] = useState(new Date().getDay());
  const [modal, setModal] = useState<ModalState | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const { data: playout } = usePlayoutState();
  const onAirProgramId = playout?.current?.programId ?? null;

  const dayRows = rows
    .filter((r) => r.dayOfWeek === dow)
    .sort((a, b) => toMin(a.startTime) - toMin(b.startTime));

  async function edit(row: ScheduleRow, patch: { startTime?: string; endTime?: string }) {
    const start = patch.startTime ?? row.startTime;
    const end = patch.endTime ?? row.endTime;
    if (toMin(end) - toMin(start) < 5) {
      setErrs((e) => ({ ...e, [row.id]: "Duração mínima de 5 min." }));
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
            : "Conflito com outro bloco — restaurado.",
    }));
  }

  return (
    <div className="space-y-3">
      <div
        className="flex gap-1 overflow-x-auto rounded-lg bg-panel p-1"
        role="tablist"
        aria-label="Dia"
      >
        {DISPLAY_ORDER.map((i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={dow === i}
            onClick={() => setDow(i)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[13px] transition-colors duration-150",
              dow === i ? "bg-element text-fg" : "text-sub",
              i === new Date().getDay() && dow !== i && "text-brand",
            )}
          >
            {DOWS[i][0]}
          </button>
        ))}
      </div>

      {sched.isLoading ? (
        <Spinner />
      ) : (
        <Card className="divide-y divide-line">
          {dayRows.length === 0 && (
            <Empty title="Dia livre">Sem blocos — o canal usa a seleção automática.</Empty>
          )}
          {dayRows.map((r) => {
            const dur = toMin(r.endTime) - toMin(r.startTime);
            return (
              <div key={r.id} className="animate-fade-in p-3">
                <div className="flex items-center gap-3">
                  <GenreTile
                    icon={r.program.genre?.icon}
                    color={r.program.genre?.color}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{r.program.name}</span>
                  {onAirProgramId === r.program.id && <Pill tone="live">no ar</Pill>}
                  <IconButton
                    icon={Trash2}
                    label="Excluir bloco"
                    tone="danger"
                    onClick={() => {
                      if (window.confirm(`Remover o bloco "${r.program.name}"?`))
                        void deleteBlock(r).then((ok) => ok === true && toast("Bloco excluído"));
                    }}
                  />
                </div>
                <div className="mt-2 flex items-center gap-2 pl-11">
                  <input
                    type="time"
                    step={300}
                    defaultValue={r.startTime}
                    key={r.id + "-s" + r.startTime}
                    onChange={(e) => void edit(r, { startTime: e.target.value })}
                    className="w-28 tnum"
                    aria-label="Início"
                  />
                  <span className="text-dim">–</span>
                  <input
                    type="time"
                    step={300}
                    defaultValue={r.endTime}
                    key={r.id + "-e" + r.endTime}
                    onChange={(e) => void edit(r, { endTime: e.target.value })}
                    className="w-28 tnum"
                    aria-label="Fim"
                  />
                  <span className="ml-auto text-xs text-dim">{dur > 0 ? durLabel(dur) : ""}</span>
                </div>
                {errs[r.id] && <p className="mt-1.5 pl-11 text-xs text-danger">{errs[r.id]}</p>}
              </div>
            );
          })}
          <div className="p-3">
            <Button
              variant="primary"
              icon={Plus}
              className="w-full"
              onClick={() => setModal({ dow })}
            >
              Novo bloco
            </Button>
          </div>
        </Card>
      )}

      {modal && (
        <BlockModal state={modal} rows={rows} onClose={() => setModal(null)} onCreate={addBlock} />
      )}
    </div>
  );
}
