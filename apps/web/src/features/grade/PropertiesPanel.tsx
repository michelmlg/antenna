/** Painel de propriedades do bloco selecionado — edita dia/início/fim inline (PATCH automático). */
import { useEffect, useState } from "react";
import { Copy, Trash2, X } from "lucide-react";
import { Badge, Button, Card, Field } from "../../components/ui";
import { GenreIcon } from "../../lib/icons";
import { DOWS, durLabel, toMin } from "./time";
import type { ScheduleRow } from "../../lib/api";
import type { MutationResult, SchedulePatch } from "./useScheduleMutations";

interface Props {
  row: ScheduleRow;
  onEdit(id: string, patch: SchedulePatch): Promise<MutationResult>;
  onDuplicate(row: ScheduleRow): void;
  onDelete(row: ScheduleRow): void;
  onClose(): void;
}

/** input type=time emite valores intermediários ("", "1", "12:") — só gravamos o completo. */
const TIME_RE = /^\d{2}:\d{2}$/;

export function PropertiesPanel({ row, onEdit, onDuplicate, onDelete, onClose }: Props) {
  const [dow, setDow] = useState(row.dayOfWeek);
  const [start, setStart] = useState(row.startTime);
  const [end, setEnd] = useState(row.endTime);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDow(row.dayOfWeek);
    setStart(row.startTime);
    setEnd(row.endTime);
    setErr(null);
  }, [row.id, row.dayOfWeek, row.startTime, row.endTime]);

  const dur = toMin(end) - toMin(start);
  const localInvalid =
    dur <= 0 ? "fim antes do início" : dur < 5 ? "duração mínima de 5 min" : null;

  async function save(patch: SchedulePatch) {
    setSaving(true);
    setErr(null);
    const result = await onEdit(row.id, patch);
    setSaving(false);
    if (result !== true)
      setErr(typeof result === "string" && result ? result : "não salvou — confira os horários");
  }

  /** grava horário só quando o par está completo e com duração válida —
   *  estados intermediários do input não disparam PATCH (evita 400 + pill "falhou"). */
  function changeTime(field: "start" | "end", value: string) {
    const nextStart = field === "start" ? value : start;
    const nextEnd = field === "end" ? value : end;
    if (field === "start") setStart(value);
    else setEnd(value);
    if (!TIME_RE.test(nextStart) || !TIME_RE.test(nextEnd)) return;
    if (toMin(nextEnd) - toMin(nextStart) < 5) return; // aviso local já aparece
    void save({ dayOfWeek: dow, startTime: nextStart, endTime: nextEnd });
  }

  return (
    <Card className="w-[280px] shrink-0">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">
          Propriedades
        </span>
        <Button size="sm" variant="ghost" onClick={onClose} title="Fechar painel">
          <X size={14} />
        </Button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold text-background"
          style={{ background: row.program.genre?.color || "#3b82f6" }}
        >
          <GenreIcon name={row.program.genre?.icon} size={12} /> {row.program.name}
        </span>
        {row.program.genre?.name && <Badge tone="muted">{row.program.genre.name}</Badge>}
      </div>

      <Field label="Dia da semana">
        <div className="grid grid-cols-7 gap-1">
          {DOWS.map(([label], i) => (
            <Button
              key={label}
              size="sm"
              variant={dow === i ? "signal" : "default"}
              className="justify-center !px-0 text-center"
              onClick={() => {
                setDow(i);
                void save({ dayOfWeek: i, startTime: start, endTime: end });
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Início">
          <input
            type="time"
            id={`blk-${row.id}-start`}
            name={`blk-${row.id}-start`}
            step={300}
            value={start}
            onChange={(e) => changeTime("start", e.target.value)}
          />
        </Field>
        <Field label="Fim">
          <input
            type="time"
            id={`blk-${row.id}-end`}
            name={`blk-${row.id}-end`}
            step={300}
            value={end}
            onChange={(e) => changeTime("end", e.target.value)}
          />
        </Field>
      </div>

      <div className="mt-1 text-xs text-muted">
        duração: <span className="font-mono text-foreground">{dur > 0 ? durLabel(dur) : "—"}</span>
        {saving && <span className="ml-2 text-signal">salvando…</span>}
      </div>
      {localInvalid && <div className="mt-1 text-xs text-danger">⚠ {localInvalid}</div>}
      {err && <div className="mt-1 text-xs text-danger">⚠ {err}</div>}

      <div className="mt-3 flex gap-2 border-t border-muted/10 pt-3">
        <Button size="sm" variant="default" className="flex-1" onClick={() => onDuplicate(row)}>
          <span className="flex items-center gap-1">
            <Copy size={12} /> Duplicar
          </span>
        </Button>
        <Button
          size="sm"
          variant="danger"
          className="flex-1"
          onClick={() => {
            if (
              window.confirm(
                `Remover o bloco "${row.program.name}" (${DOWS[row.dayOfWeek][0]} ${row.startTime}–${row.endTime})?`,
              )
            )
              onDelete(row);
          }}
        >
          <span className="flex items-center gap-1">
            <Trash2 size={12} /> Excluir
          </span>
        </Button>
      </div>
    </Card>
  );
}
