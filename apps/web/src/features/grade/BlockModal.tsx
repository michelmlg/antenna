/** Modal de criação de bloco ("Programar" / tecla N). Edição é na grade (drag/alças). */
import { useState } from "react";
import type { ScheduleRow } from "../../lib/api";
import { useGenres } from "../../lib/queries";
import { Button, ErrorMsg, Field, Modal, cn } from "../../components/ui";
import type { MutationResult } from "./useScheduleMutations";
import { DOWS, DISPLAY_ORDER, durLabel, hasOverlap, toMin } from "./time";

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
  const { data: genres } = useGenres();
  const [genreId, setGenreId] = useState("");
  const [dow, setDow] = useState(state.dow ?? new Date().getDay());
  const [start, setStart] = useState("20:00");
  const [end, setEnd] = useState("21:00");
  const [apiError, setApiError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const dur = toMin(end) - toMin(start);
  const invalid = !genreId
    ? "Escolha um gênero."
    : dur <= 0
      ? "O fim precisa ser depois do início (blocos não cruzam a meia-noite)."
      : dur < 5
        ? "Duração mínima de 5 minutos."
        : hasOverlap(rows, dow, toMin(start), toMin(end))
          ? `Conflita com outro bloco de ${DOWS[dow][1].toLowerCase()}.`
          : null;

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
    <Modal
      title="Programar bloco"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={!!invalid}
            loading={saving}
          >
            Programar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Gênero" hint="Cria (ou reaproveita) o programa automático do gênero.">
          <select value={genreId} onChange={(e) => setGenreId(e.target.value)} className="w-full">
            <option value="">Selecione…</option>
            {(genres ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] text-sub">Dia da semana</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Dia da semana">
            {DISPLAY_ORDER.map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={dow === i}
                onClick={() => setDow(i)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-[13px] transition-[background-color,border-color,color,transform] duration-150 active:scale-95",
                  dow === i
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-line text-sub hover:border-element hover:text-fg",
                )}
              >
                {DOWS[i][0]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Início">
            <input
              type="time"
              step={300}
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="tnum"
            />
          </Field>
          <Field label="Fim">
            <input
              type="time"
              step={300}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="tnum"
            />
          </Field>
          <Field label="Duração">
            <div className="flex h-9 items-center text-sm text-sub tnum">
              {dur > 0 ? durLabel(dur) : "—"}
            </div>
          </Field>
        </div>
        {invalid && genreId && <p className="text-[13px] text-danger">{invalid}</p>}
        <ErrorMsg error={apiError} />
      </div>
    </Modal>
  );
}
