/**
 * Mutations da grade + histórico local (undo/redo).
 * Durante arraste/resize a rede não é tocada; gravação acontece só no fim da
 * interação, com optimistic update e rollback (invalidate) em falha.
 */
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type ScheduleRow } from "../../lib/api";

export interface SchedulePatch {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

interface HistOp {
  kind: "update" | "create" | "delete";
  /** valores originais (update/delete) ou a linha enviada (create) */
  before?: ScheduleRow;
  /** resultado do servidor (update/create) */
  after?: ScheduleRow;
  /** id atual do lado servidor — pode mudar quando delete + undo recria */
  serverId?: string;
}

export type Status = { kind: "idle" | "saving" | "ok" | "error"; msg?: string };

function scheduleBody(row: ScheduleRow): SchedulePatch {
  return { dayOfWeek: row.dayOfWeek, startTime: row.startTime, endTime: row.endTime };
}

export function useGradeSchedule() {
  const qc = useQueryClient();
  const rowsQ = useQuery({
    queryKey: ["schedule"],
    queryFn: () => api.get<ScheduleRow[]>("/schedule"),
  });
  const rows = rowsQ.data ?? [];
  // polling removido: invalidação explícita nas mutations (polling derruba drag/undo)

  const pendingRef = useRef(0);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [undoStack, setUndoStack] = useState<HistOp[]>([]);
  const [redoStack, setRedoStack] = useState<HistOp[]>([]);

  const setRows = useCallback(
    (fn: (prev: ScheduleRow[]) => ScheduleRow[]) => {
      qc.setQueryData<ScheduleRow[]>(["schedule"], (prev) => fn(prev ?? []));
    },
    [qc]
  );

  const track = useCallback(
    async (fn: () => Promise<unknown>): Promise<boolean> => {
      pendingRef.current++;
      setSaving(true);
      setStatus({ kind: "saving" });
      try {
        await fn();
        await qc.invalidateQueries({ queryKey: ["schedule"] });
        setStatus({ kind: "ok" });
        return true;
      } catch (e) {
        setStatus({ kind: "error", msg: (e as Error).message });
        await qc.invalidateQueries({ queryKey: ["schedule"] }); // rollback visual
        return false;
      } finally {
        pendingRef.current--;
        if (pendingRef.current <= 0) setSaving(false);
      }
    },
    [qc]
  );

  // dentro de undo/redo, replay não empilha história de novo
  const replayingRef = useRef(false);

  /** mover/redimensionar um bloco (drag, alças ou modal). */
  const updateBlock = useCallback(
    async (id: string, patch: SchedulePatch): Promise<boolean> => {
      const prev = (qc.getQueryData<ScheduleRow[]>(["schedule"]) ?? []).find((r) => r.id === id);
      if (!prev) return false;
      setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r))); // optimistic
      const ok = await track(() => api.patch<ScheduleRow>(`/schedule/${id}`, patch));
      if (ok && !replayingRef.current)
        setUndoStack((s) => [...s.slice(-29), { kind: "update", before: prev, after: { ...prev, ...patch } }]);
      return ok;
    },
    [qc, setRows, track]
  );

  /** criar bloco (biblioteca, duplicar ou modal). */
  const addBlock = useCallback(
    async (body: { genreId?: string; programId?: string; dayOfWeek: number; startTime: string; endTime: string }): Promise<boolean> => {
      const ok = await track(() => api.post<ScheduleRow>("/schedule", body));
      return ok;
    },
    [track]
  );

  const deleteBlock = useCallback(
    async (row: ScheduleRow): Promise<boolean> => {
      setRows((all) => all.filter((r) => r.id !== row.id)); // optimistic
      const ok = await track(() => api.del(`/schedule/${row.id}`));
      if (ok && !replayingRef.current)
        setUndoStack((s) => [...s.slice(-29), { kind: "delete", before: row, serverId: row.id }]);
      return ok;
    },
    [setRows, track]
  );

  const doCreate = useCallback(
    (body: { genreId?: string; programId?: string; dayOfWeek: number; startTime: string; endTime: string }) =>
      api.post<ScheduleRow>("/schedule", body),
    []
  );

  const undoOp = useCallback(async () => {
    const op = undoStack[undoStack.length - 1];
    if (!op) return;
    replayingRef.current = true;
    try {
      if (op.kind === "update") await api.patch(`/schedule/${op.before!.id}`, scheduleBody(op.before!));
      else if (op.kind === "create") await api.del(`/schedule/${op.after!.id}`);
      else {
        // recria vinculado ao mesmo programa (POST sem vínculo daria 400)
        const created = await doCreate({ programId: op.before!.program.id, ...scheduleBody(op.before!) });
        op.serverId = created.id;
      }
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      setUndoStack((s) => s.slice(0, -1));
      setRedoStack((s) => [...s, op]);
      setStatus({ kind: "ok" });
    } catch (e) {
      setStatus({ kind: "error", msg: (e as Error).message });
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    } finally {
      replayingRef.current = false;
    }
  }, [doCreate, qc, undoStack]);

  const redoOp = useCallback(async () => {
    const op = redoStack[0];
    if (!op) return;
    replayingRef.current = true;
    try {
      if (op.kind === "update") await api.patch(`/schedule/${op.before!.id}`, scheduleBody(op.after!));
      else if (op.kind === "create") {
        // recria vinculado ao mesmo programa (POST sem vínculo daria 400)
        const created = await doCreate({ programId: op.after!.program.id, ...scheduleBody(op.after!) });
        op.after = created;
      } else await api.del(`/schedule/${op.serverId ?? op.before!.id}`);
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      setRedoStack((s) => s.slice(1));
      setUndoStack((s) => [...s, op]);
      setStatus({ kind: "ok" });
    } catch (e) {
      setStatus({ kind: "error", msg: (e as Error).message });
      await qc.invalidateQueries({ queryKey: ["schedule"] });
    } finally {
      replayingRef.current = false;
    }
  }, [doCreate, redoStack, qc]);

  return {
    rows,
    isLoading: rowsQ.isLoading,
    saving,
    status,
    updateBlock,
    addBlock,
    deleteBlock,
    undo: undoOp,
    redo: redoOp,
  };
}

