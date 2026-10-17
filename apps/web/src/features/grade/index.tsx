/**
 * Grade de Programação — timeline semanal (layout A do PLANO.md §16.1):
 * 7 trilhas horizontais, régua compartilhada, blocos arrastáveis/redimensionáveis.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { DndContext, DragOverlay, type DragEndEvent, type DragMoveEvent, type DragStartEvent, PointerSensor, useSensor, useSensors, type Modifier } from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, Card, Spinner } from "../../components/ui";
import { api, type GenreRow, type PlayoutState, type ScheduleRow } from "../../lib/api";
import { hasOverlap, minutesToHHMM, snapMinutes, toMin, cursorMinute, DOWS, LABEL_W, LANE_H, pxPerMinAuto, clampedPx } from "./time";
import { useGradeSchedule, type SchedulePatch } from "./useScheduleMutations";
import { DayLane, type Preview } from "./DayLane";
import { LibraryPanel, firstFreeSlot } from "./LibraryPanel";
import { BlockModal, type ModalState } from "./BlockModal";

interface DragState {
  id: string;
  mode: "move" | "left" | "right";
  dow: number;
  startMin: number;
  endMin: number;
  grabMin: number;
  startX: number;
  startY: number;
  moved: boolean;
}

type Zoom = "auto" | number;
const ZOOM_STEPS: number[] = [0.35, 0.75, 1.5, 3, 5];

/** Modifier do dnd-kit: centraliza o chip arrastado NO CURSOR (a posição do
 * elemento traduzido deslocava a prévia — agora prévia e overlay miram o ponteiro). */
const centerOnCursor: Modifier = ({ draggingNodeRect, transform, activatorEvent }) => {
  const base = transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  const ae = activatorEvent as PointerEvent | MouseEvent | null;
  if (!draggingNodeRect || !ae || ae.clientX == null) return base;
  const curX = ae.clientX + base.x;
  const curY = ae.clientY + base.y;
  return {
    ...base,
    x: curX - (draggingNodeRect.left + draggingNodeRect.width / 2),
    y: curY - (draggingNodeRect.top + draggingNodeRect.height / 2),
  };
};

export default function Grade() {
  const sched = useGradeSchedule();
  const { rows, updateBlock, addBlock, deleteBlock } = sched;

  const { data: playout } = useQuery({
    queryKey: ["playout"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 15000,
  });
  const onAirProgramId = playout?.current?.programId ?? null;

  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [zoom, setZoom] = useState<Zoom>("auto");
  const [libOpen, setLibOpen] = useState(true);
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const setPreview = (p: Preview | null) => {
    previewRef.current = p;
    setPreviewState(p);
  };

  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewW, setViewW] = useState(1200);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, [!!sched.isLoading]); // re-download das medidas quando a área aparece

  const autoPx = pxPerMinAuto(viewW);
  const px = zoom === "auto" ? autoPx : zoom;
  const hourPx = px * 60;

  // ---- refs dos trilhos (geometria p/ drag/preview) ----
  const tracksRef = useRef<(HTMLDivElement | null)[]>([]);
  const registerTrack = useCallback((dow: number, el: HTMLDivElement | null) => {
    tracksRef.current[dow] = el;
  }, []);

  const laneUnder = useCallback((clientY: number): number | null => {
    for (let d = 0; d < 7; d++) {
      const el = tracksRef.current[d];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY >= r.top - 6 && clientY <= r.bottom + 6) return d;
    }
    return null;
  }, []);
  const trackLeft = useCallback((): number => {
    const el = tracksRef.current.find(Boolean);
    return el ? el.getBoundingClientRect().left : 0;
  }, []);

  // ---- drag & resize dos blocos (pointer events) ----
  const drag = useRef<DragState | null>(null);

  const onPick = useCallback(
    (e: React.PointerEvent, row: ScheduleRow, mode: "move" | "left" | "right") => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      setSelId(row.id);
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* ponteiro sintético (automação) não tem sessão de captura */
      }
      drag.current = {
        id: row.id,
        mode,
        dow: row.dayOfWeek,
        startMin: toMin(row.startTime),
        endMin: toMin(row.endTime),
        grabMin: mode === "move" ? toMin(row.startTime) - cursorMinute(e.clientX, trackLeft(), px) : 0,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      setPreview({ dow: row.dayOfWeek, start: toMin(row.startTime), end: toMin(row.endTime), valid: true });
    },
    [px, trackLeft]
  );

  const onPickMove = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
      const left = trackLeft();
      const targetDow = d.mode === "move" ? (laneUnder(e.clientY) ?? d.dow) : d.dow;
      const cur = cursorMinute(e.clientX, left, px);
      let start: number;
      let end: number;
      if (d.mode === "move") {
        const dur = d.endMin - d.startMin;
        start = Math.min(1440 - dur, Math.max(0, snapMinutes(cur - d.grabMin)));
        end = start + dur;
      } else if (d.mode === "right") {
        start = d.startMin;
        end = Math.min(1440, Math.max(start + 5, snapMinutes(cur)));
      } else {
        end = d.endMin;
        start = Math.max(0, Math.min(end - 5, snapMinutes(cur)));
      }
      const valid = !hasOverlap(rows, targetDow, start, end, d.id);
      const p = previewRef.current;
      if (!p || p.dow !== targetDow || p.start !== start || p.end !== end) {
        setPreview({ dow: targetDow, start, end, valid });
      } else if (p.valid !== valid) setPreview({ ...p, valid });
    },
    [laneUnder, px, rows, trackLeft]
  );

  const onPickUp = useCallback(
    (e: React.PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        /* pointer já solto */
      }
      const p = previewRef.current;
      setPreview(null);
      if (!d.moved || !p) return; // clique simples = só seleção
      const changed = p.dow !== d.dow || p.start !== d.startMin || p.end !== d.endMin;
      if (!p.valid || !changed) return; // inválido → volta ao lugar (sem salvar)
      void updateBlock(d.id, { dayOfWeek: p.dow, startTime: minutesToHHMM(p.start), endTime: minutesToHHMM(p.end) });
    },
    [updateBlock]
  );

  // ---- dnd-kit: biblioteca → timeline ----
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const libGenre = useRef<GenreRow | null>(null);
  const [libActive, setLibActive] = useState<GenreRow | null>(null);
  // ponteiro BRUTO: ev.delta do dnd-kit vem pós-modifier (centraliza no cursor) e
  // não serve para derivar a posição do mouse — rastreamos o pointermove direto.
  const rawPointer = useRef({ x: 0, y: 0 });
  const rawTrackRef = useRef<((e: PointerEvent) => void) | null>(null);
  const stopRawTrack = useCallback(() => {
    if (rawTrackRef.current) {
      document.removeEventListener("pointermove", rawTrackRef.current, true);
      rawTrackRef.current = null;
    }
  }, []);

  const libPreview = useCallback(
    (ev: DragMoveEvent | DragEndEvent): Preview | null => {
      const genre = libGenre.current;
      if (!genre) return null;
      const { x: pointerX, y: pointerY } = rawPointer.current;
      const dow = laneUnder(pointerY);
      if (dow === null) return null;
      const dur = 60; // bloco-padrão de 1h (gênero não tem duração alvo)
      const pointerMin = Math.round((pointerX - trackLeft()) / px);
      const start = Math.min(1440 - dur, Math.max(0, snapMinutes(pointerMin - Math.round(dur / 2))));
      const end = start + dur;
      return { dow, start, end, valid: !hasOverlap(rows, dow, start, end) };
    },
    [laneUnder, px, rows, trackLeft]
  );

  const onDragStart = useCallback((ev: DragStartEvent) => {
    const d = ev.active.data.current as { kind?: string; genre?: GenreRow } | undefined;
    if (d?.kind === "library" && d.genre) {
      libGenre.current = d.genre;
      setLibActive(d.genre);
      const ae = ev.activatorEvent as PointerEvent | undefined;
      rawPointer.current = { x: ae?.clientX ?? 0, y: ae?.clientY ?? 0 };
      const track = (e: PointerEvent) => {
        rawPointer.current = { x: e.clientX, y: e.clientY };
      };
      rawTrackRef.current = track;
      document.addEventListener("pointermove", track, true);
    }
  }, []);

  const onDragMove = useCallback((ev: DragMoveEvent) => setPreview(libPreview(ev)), [libPreview]);

  const onDragEnd = useCallback(
    (ev: DragEndEvent) => {
      stopRawTrack();
      const genre = libGenre.current;
      const p = ev.over ? libPreview(ev) : null;
      libGenre.current = null;
      setLibActive(null);
      setPreview(null);
      if (!genre || !p) return;
      if (!p.valid) return; // conflito → nada acontece
      void addBlock({
        genreId: genre.id,
        dayOfWeek: p.dow,
        startTime: minutesToHHMM(p.start),
        endTime: minutesToHHMM(p.end),
      });
    },
    [addBlock, libPreview, stopRawTrack]
  );

  const onDragCancel = useCallback(() => {
    stopRawTrack();
    libGenre.current = null;
    setLibActive(null);
    setPreview(null);
  }, [stopRawTrack]);

  // ---- linha "agora" ----
  const [now, setNow] = useState(() => ({ dow: new Date().getDay(), min: new Date().getHours() * 60 + new Date().getMinutes() }));
  useEffect(() => {
    const t = setInterval(() => setNow({ dow: new Date().getDay(), min: new Date().getHours() * 60 + new Date().getMinutes() }), 30_000);
    return () => clearInterval(t);
  }, []);

  // ---- ações contextuais + atalhos ----
  const selected = rows.find((r) => r.id === selId) ?? null;

  const duplicate = useCallback(
    (row: ScheduleRow) => {
      const dur = toMin(row.endTime) - toMin(row.startTime);
      const slot = firstFreeSlot(rows, row.dayOfWeek, dur, toMin(row.endTime));
      if (!slot) return;
      void addBlock(
        row.program.genre
          ? { genreId: row.program.genre.id, dayOfWeek: row.dayOfWeek, startTime: minutesToHHMM(slot.start), endTime: minutesToHHMM(slot.end) }
          : { programId: row.program.id, dayOfWeek: row.dayOfWeek, startTime: minutesToHHMM(slot.start), endTime: minutesToHHMM(slot.end) }
      );
    },
    [addBlock, rows]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modal) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      const ctl = e.ctrlKey || e.metaKey;
      if (ctl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) void sched.redo();
        else void sched.undo();
      } else if (ctl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void sched.redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected && window.confirm(`Remover o bloco "${selected.program.name}" (${DOWS[selected.dayOfWeek][0]} ${selected.startTime}–${selected.endTime})?`)) void deleteBlock(selected);
      } else if (e.key.toLowerCase() === "d" && selected) {
        e.preventDefault();
        duplicate(selected);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModal({ mode: "create" });
      } else if (e.key === "Escape") {
        setSelId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteBlock, duplicate, modal, sched, selected]);

  // ---- navegação / zoom ----
  const laneNames = useMemo(() => DOWS.map(([, full]) => full), []);
  const gotoDay = (dowStr: string) => {
    const dow = Number(dowStr);
    const el = tracksRef.current[dow];
    const sc = scrollerRef.current;
    if (el && sc) sc.scrollTo({ top: el.offsetTop - 34, behavior: "smooth" });
  };

  const zoomIn = () => {
    const next = ZOOM_STEPS.find((z) => z > px - 0.01) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
    setZoom(clampedPx(next));
  };
  const zoomOut = () => {
    const prev = [...ZOOM_STEPS].reverse().find((z) => z < px + 0.01);
    setZoom(prev ? clampedPx(prev) : "auto");
  };

  const byDay = DOWS.map((_, dow) => rows.filter((r) => r.dayOfWeek === dow).sort((a, b) => toMin(a.startTime) - toMin(b.startTime)));
  const pill =
    sched.saving ? (
      <Badge tone="signal">salvando…</Badge>
    ) : sched.status.kind === "error" ? (
      <span title={sched.status.msg ?? "falha ao salvar"}>
        <Badge tone="red">falhou (desfeito)</Badge>
      </span>
    ) : sched.status.kind === "ok" ? (
      <Badge tone="green">salvo</Badge>
    ) : (
      <Badge tone="muted">sem alterações</Badge>
    );

  return (
    <div className="flex flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Grade de Programação</h1>
          <p className="text-sm text-muted">Arraste blocos entre dias e horários; alças nas bordas redimensionam. Fora dos blocos: seleção automática.</p>
        </div>
        <div className="flex items-center gap-2">
          {pill}
          <Button size="sm" variant="ghost" title="Desfazer (Ctrl+Z)" onClick={() => void sched.undo()} disabled={sched.saving}>
            ⟲
          </Button>
          <Button size="sm" variant="ghost" title="Refazer (Ctrl+Y)" onClick={() => void sched.redo()} disabled={sched.saving}>
            ⟳
          </Button>
          <span className="mx-1 h-5 w-px bg-muted/20" />
          <Button size="sm" variant="default" title="Menos zoom" onClick={zoomOut}>
            ⊖
          </Button>
          <Button size="sm" variant="default" title="Mais zoom" onClick={zoomIn}>
            ⊕
          </Button>
          <select value={String(zoom)} onChange={(e) => setZoom(e.target.value === "auto" ? "auto" : Number(e.target.value))} className="rounded border border-muted/20 bg-surface px-1 py-1 text-xs" title="Zoom">
            <option value="auto">auto</option>
            {ZOOM_STEPS.map((z) => (
              <option key={z} value={z}>{String(z)}</option>
            ))}
          </select>
          <select onChange={(e) => e.target.value && gotoDay(e.target.value)} className="rounded border border-muted/20 bg-surface px-1 py-1 text-xs" defaultValue="" title="Ir para o dia">
            <option value="">ir p/ dia…</option>
            {laneNames.map((n, i) => (
              <option key={i} value={i}>{n}</option>
            ))}
          </select>
          {selected && (
            <div className="flex items-center gap-1.5 rounded border border-signal/40 bg-signal/10 px-2 py-1">
              <span className="max-w-40 truncate text-xs font-medium">{selected.program.name}</span>
              <Button size="sm" variant="ghost" onClick={() => setModal({ mode: "edit", row: selected })} title="Editar (duplo-clique)">
                ✎
              </Button>
              <Button size="sm" variant="ghost" onClick={() => duplicate(selected)} title="Duplicar (D)">
                ⧉
              </Button>
              <Button
                size="sm"
                variant="ghost"
                title="Excluir (Del)"
                onClick={() => {
                  if (selected && window.confirm(`Remover o bloco "${selected.program.name}"?`)) {
                    void deleteBlock(selected);
                    setSelId(null);
                  }
                }}
              >
                <span className="text-red-400">✕</span>
              </Button>
            </div>
          )}
          <Button variant="signal" onClick={() => setModal({ mode: "create", dow: now.dow })}>
            + Programar bloco
          </Button>
        </div>
      </div>

      {sched.isLoading ? (
        <Spinner />
      ) : (
        <DndContext sensors={sensors} modifiers={[centerOnCursor]} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
          <div className="flex gap-3">
            <LibraryPanel open={libOpen} onToggle={() => setLibOpen((v) => !v)} onNewBlock={() => setModal({ mode: "create" })} />
            <Card className="min-w-0 flex-1 p-0">
              <div ref={scrollerRef} className="overflow-y-auto overflow-x-auto rounded-lg" style={{ height: "calc(100vh - 190px)", minHeight: 340 }}>
                <div style={{ width: LABEL_W + 1440 * px + 2 }} className="relative">
                  {/* régua (sticky) */}
                  <div className="sticky top-0 z-30 flex border-b border-muted/20 bg-surface">
                    <div className="sticky left-0 z-40 w-16 shrink-0 border-r border-muted/20 bg-surface" />
                    <div className="relative" style={{ width: 1440 * px }}>
                      {Array.from({ length: 25 }, (_, h) => (
                        <div key={h} className="absolute top-0 flex h-7 items-end" style={{ left: h * hourPx }}>
                          {px * 60 >= 22 || h % 3 === 0 ? (
                            <span className="pl-1 font-mono text-[10px] text-muted">{String(h % 24).padStart(2, "0")}h</span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                  {byDay.map((blocks, dow) => (
                    <DayLane
                      key={dow}
                      dow={dow}
                      name={laneNames[dow]}
                      px={px}
                      hourPx={hourPx}
                      blocks={blocks}
                      today={dow === now.dow}
                      nowMin={dow === now.dow ? now.min : null}
                      onAirProgramId={onAirProgramId}
                      selectedId={selId}
                      preview={preview}
                      registerTrack={registerTrack}
                      onPick={onPick}
                      onPickMove={onPickMove}
                      onPickUp={onPickUp}
                      onOpen={(row) => setModal({ mode: "edit", row })}
                    />
                  ))}
                </div>
              </div>
            <div className="border-t border-muted/10 px-3 py-2 text-[11px] text-muted">
              duplo-clique = editar · arrastar = mover · bordas = redimensionar · <kbd>N</kbd> novo · <kbd>D</kbd> duplicar · <kbd>Del</kbd> excluir · <kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Y</kbd>
            </div>
          </Card>
          </div>
          <DragOverlay dropAnimation={null}>
            {libActive ? (
              <div className="rounded border bg-surface px-2 py-1.5 text-xs shadow-lg" style={{ borderLeft: `3px solid ${libActive.color}` }}>
                {libActive.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
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
