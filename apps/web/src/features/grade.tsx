/** Grade (EPG) — blocos semanais por gênero + criação. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api, type GenreRow, type ScheduleRow } from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Modal, Spinner } from "../components/ui";
import { GenreIcon } from "../lib/icons";

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function BlocoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [genreId, setGenreId] = useState("");
  const [days, setDays] = useState<number[]>([]);
  const [start, setStart] = useState("20:00");
  const [end, setEnd] = useState("21:00");

  const { data: genres } = useQuery({ queryKey: ["genres"], queryFn: () => api.get<GenreRow[]>("/genres") });
  const create = useMutation({
    mutationFn: () => Promise.all(days.map((d) => api.post("/schedule", { genreId, dayOfWeek: d, startTime: start, endTime: end }))),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule"] });
      onClose();
    },
  });

  return (
    <Modal title="Programar bloco" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Gênero">
          <select value={genreId} onChange={(e) => setGenreId(e.target.value)} className="w-full">
            <option value="">— escolha —</option>
            {(genres ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dias da semana">
          <div className="flex gap-1.5">
            {DAYS.map((d, i) => (
              <Button
                key={d}
                size="sm"
                variant={days.includes(i) ? "signal" : "default"}
                onClick={() => setDays((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]))}
              >
                {d}
              </Button>
            ))}
          </div>
        </Field>
        <div className="flex gap-3">
          <Field label="Início">
            <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Fim">
            <input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        <p className="text-[11px] text-muted">O programa do gênero é criado/reaproveitado automaticamente.</p>
        <ErrorMsg error={create.error} />
        <Button variant="signal" onClick={() => create.mutate()} disabled={!genreId || !days.length || create.isPending}>
          Programar
        </Button>
      </div>
    </Modal>
  );
}

export default function Grade() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const { data: rows } = useQuery({
    queryKey: ["schedule"],
    queryFn: () => api.get<ScheduleRow[]>("/schedule"),
    refetchInterval: 15000,
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/schedule/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["schedule"] }),
  });

  const byDay = DAYS.map((_, dow) => (rows ?? []).filter((r) => r.dayOfWeek === dow).sort((a, b) => a.startTime.localeCompare(b.startTime)));
  const now = new Date();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Guia de programação</h1>
          <p className="text-sm text-muted">Blocos semanais — fora deles, o canal passa seleção automática.</p>
        </div>
        <Button variant="signal" onClick={() => setModal(true)}>
          <span className="flex items-center gap-1.5">
            <Plus size={15} /> Programar bloco
          </span>
        </Button>
      </div>

      {!rows ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {byDay.map((blocks, dow) => (
            <Card key={dow} className={`min-h-28 ${dow === now.getDay() ? "border-signal/40" : ""}`}>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                {DAYS[dow]} {dow === now.getDay() && <Badge tone="signal">hoje</Badge>}
              </div>
              {blocks.length === 0 ? (
                <div className="text-[11px] text-muted">livre (auto)</div>
              ) : (
                <ul className="space-y-2">
                  {blocks.map((r) => (
                    <li key={r.id} className="rounded border border-muted/10 p-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-muted">
                          {r.startTime}–{r.endTime}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)} title="Remover bloco">
                          <Trash2 size={12} className="text-red-400" />
                        </Button>
                      </div>
                      <div
                        className="mt-1 flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-background"
                        style={{ background: r.program.genre?.color || "#3b82f6" }}
                      >
                        <GenreIcon name={r.program.genre?.icon} size={12} /> {r.program.name}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
