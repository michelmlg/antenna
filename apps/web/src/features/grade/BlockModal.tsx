/** Modal de criação de bloco ("+ Programar" / "Novo bloco"). Edição é na grade (drag/alças). */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type GenreRow, type ScheduleRow } from "../../lib/api";
import { hasOverlap, toMin } from "./time";
import { Button, ErrorMsg, Field, Modal } from "../../components/ui";
import type { MutationResult } from "./useScheduleMutations";
import { DOWS } from "./time";

export interface ModalState {
  dow?: number;
}

interface Props {
  state: ModalState;
  rows: ScheduleRow[];
  onClose(): void;
  onCreate(body: {
    genreId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
  }): Promise<MutationResult>;
}

export function BlockModal({ state, rows, onClose, onCreate }: Props) {
  const { data: genres } = useQuery({
    queryKey: ["genres"],
    queryFn: () => api.get<GenreRow[]>("/genres"),
  });

  const [genreId, setGenreId] = useState("");
  const [dow, setDow] = useState(state.dow ?? new Date().getDay());
  const [start, setStart] = useState("20:00");
  const [end, setEnd] = useState("21:00");
  const [apiError, setApiError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const dur = toMin(end) - toMin(start);
  const overlap = hasOverlap(rows, dow, toMin(start), toMin(end));
  const invalid = !genreId
    ? "escolha um gênero"
    : dur < 5
      ? "duração mínima de 5 min"
      : dur <= 0
        ? "fim antes do início"
        : overlap
          ? "sobreposição com outro bloco deste dia"
          : null;

  const canSave = !invalid && !saving;

  async function save() {
    if (invalid) return;
    setSaving(true);
    setApiError(null);
    const result = await onCreate({ genreId, dayOfWeek: dow, startTime: start, endTime: end });
    setSaving(false);
    if (result === true) onClose();
    else if (typeof result === "string" && result) setApiError(new Error(result));
  }

  return (
    <Modal title="Programar bloco" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Gênero (cria/reaproveita o auto-programa)">
          <select
            id="blk-genre"
            name="blk-genre"
            value={genreId}
            onChange={(e) => setGenreId(e.target.value)}
            className="w-full"
          >
            <option value="">— selecione —</option>
            {(genres ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dia da semana">
          <div className="flex flex-wrap gap-1.5">
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
        </Field>
        <div className="flex gap-3">
          <Field label="Início">
            <input
              id="blk-new-start"
              name="blk-new-start"
              type="time"
              step={300}
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field label="Fim">
            <input
              id="blk-new-end"
              name="blk-new-end"
              type="time"
              step={300}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
          <Field label="Duração">
            <div className="px-1 py-1.5 text-sm text-muted">
              {dur > 0
                ? `${Math.floor(dur / 60)}h${dur % 60 ? `${dur % 60}m` : ""}`.replace("h0", "h ")
                : "—"}
            </div>
          </Field>
        </div>
        {invalid && <div className="text-xs text-danger">⚠ {invalid}</div>}
        <ErrorMsg error={apiError} />
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="signal" onClick={save} disabled={!canSave}>
            Programar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
