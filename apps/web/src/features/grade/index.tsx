/**
 * Grade de Programação — timeline semanal (layout A do PLANO.md §16.1):
 * 7 trilhas horizontais, régua compartilhada, blocos arrastáveis/redimensionáveis.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  DndContext,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  type Modifier,
} from "@dnd-kit/core";
import { useQuery } from "@tanstack/react-query";
import { Maximize, Plus, Redo2, Undo2, ZoomIn, ZoomOut } from "lucide-react";
import { Button, Card, Spinner, StatusPill } from "../../components/ui";
import { api, type GenreRow, type PlayoutState, type ScheduleRow } from "../../lib/api";
import {
  hasOverlap,
  minutesToHHMM,
  snapMinutes,
  toMin,
  cursorMinute,
  DOWS,
  LABEL_W,
  LANE_H,
  pxPerMinAuto,
  clampedPx,
} from "./time";
import { useGradeSchedule, type MutationResult, type SchedulePatch } from "./useScheduleMutations";
import { DayLane, type Preview } from "./DayLane";
import { LibraryPanel, firstFreeSlot } from "./LibraryPanel";
import { BlockModal, type ModalState } from "./BlockModal";
import { Dropdown } from "./Dropdown";
import { ProfilesMenu } from "./ProfilesMenu";
import GradeMobile from "./GradeMobile";

function useIsMobile(): boolean {
  const [m, setM] = useState(() => window.matchMedia("(max-width: 767px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const h = (e: MediaQueryListEvent) => setM(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return m;
}

interface DragState {
  id: string;
  mode: "move" | "left" | "right";
  dow: number;
  startMin: number;
  endMin: number;
  startX: number;
  startY: number;
  moved: boolean;
}

type Zoom = "auto" | number;
const ZOOM_STEPS: number[] = [0.35, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5];

/** Modifier do dnd-kit: ancora o chip arrastado com a BORDA ESQUERDA no cursor
 * (o bloco cai com o início onde você aponta — chip e ghost ficam alinhados) e
 * centrado na vertical. */
const anchorOnCursor: Modifier = ({ draggingNodeRect, transform, activatorEvent }) => {
  const base = transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  const ae = activatorEvent as PointerEvent | MouseEvent | null;
  if (!draggingNodeRect || !ae || ae.clientX == null) return base;
  const curX = ae.clientX + base.x;
  const curY = ae.clientY + base.y;
  return {
    ...base,
    x: curX - draggingNodeRect.left,
    y: curY - (draggingNodeRect.top + draggingNodeRect.height / 2),
  };
};

export default function Grade() {
  const sched = useGradeSchedule();
  const { rows, updateBlock, addBlock, deleteBlock } = sched;
  const isMobile = useIsMobile();

  // blocos com PATCH em andamento (contorno tracejado = alteração não salva ainda)
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const updateTracked = useCallback(
    async (id: string, patch: SchedulePatch): Promise<MutationResult> => {
      setPendingIds((prev) => new Set(prev).add(id));
      try {
        return await updateBlock(id, patch);
      } finally {
        setPendingIds((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
      }
    },
    [updateBlock],
  );

  // linha "agora" (atualizada a cada 30s)
  const [now, setNow] = useState(() => ({
    dow: new Date().getDay(),
    min: new Date().getHours() * 60 + new Date().getMinutes(),
  }));
  useEffect(() => {
    const t = setInterval(
      () =>
        setNow({
          dow: new Date().getDay(),
          min: new Date().getHours() * 60 + new Date().getMinutes(),
        }),
      30_000,
    );
    return () => clearInterval(t);
  }, []);

  const { data: playout } = useQuery({
    queryKey: ["playout"],
    queryFn: () => api.get<PlayoutState>("/playout/state"),
    refetchInterval: 15000,
  });
  // "no ar" = só o bloco em execução (programa do estado + dia + faixa contendo agora),
  // não todos os blocos do gênero (o auto-programa é compartilhado entre blocos)
  const onAirBlockId = useMemo(() => {
    const pid = playout?.current?.programId;
    if (!pid) return null;
    const row = rows.find(
      (r) =>
        r.program.id === pid &&
        r.dayOfWeek === now.dow &&
        toMin(r.startTime) <= now.min &&
        now.min < toMin(r.endTime),
    );
    return row?.id ?? null;
  }, [playout, rows, now]);

  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [zoom, setZoom] = useState<Zoom>("auto");
  const [libOpen, setLibOpen] = useState(true);
  const [preview, setPreviewState] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const setPreview = (p: Preview | null) => {
    const cur = previewRef.current;
    if (
      p &&
      cur &&
      p.dow === cur.dow &&
      p.start === cur.start &&
      p.end === cur.end &&
      p.valid === cur.valid
    )
      return;
    previewRef.current = p;
    setPreviewState(p);
  };

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [viewW, setViewW] = useState(1200);
  const roRef = useRef<ResizeObserver | null>(null);
  // ref callback: re-observa a CADA remontagem do scroller (flip mobile/desktop, HMR) —
  // um RO preso a elemento órfão deixava o zoom "auto" congelado no default
  const scrollerRefCb = useCallback((el: HTMLDivElement | null) => {
    scrollerRef.current = el;
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    roRef.current = ro;
    setViewW(el.clientWidth);
  }, []);

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
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
      setPreview({
        dow: row.dayOfWeek,
        start: toMin(row.startTime),
        end: toMin(row.endTime),
        valid: true,
      });
    },
    [px, trackLeft],
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
        // mesma regra da biblioteca: o INÍCIO do bloco vai ao cursor (WYSIWYG)
        const dur = d.endMin - d.startMin;
        start = Math.min(1440 - dur, Math.max(0, snapMinutes(cur)));
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
    [laneUnder, px, rows, trackLeft],
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
      void updateTracked(d.id, {
        dayOfWeek: p.dow,
        startTime: minutesToHHMM(p.start),
        endTime: minutesToHHMM(p.end),
      });
    },
    [updateTracked],
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

  // posição do bloco a partir do ponteiro: INÍCIO no cursor (soltar = bloco começa
  // onde você apontou; snap 5 min), não centralizado — evita a sensação de "cai à direita"
  const libPreview = useCallback((): Preview | null => {
    const genre = libGenre.current;
    if (!genre) return null;
    const { x: pointerX, y: pointerY } = rawPointer.current;
    const dow = laneUnder(pointerY);
    if (dow === null) return null;
    const dur = 60; // bloco-padrão de 1h (gênero não tem duração alvo)
    const pointerMin = Math.round((pointerX - trackLeft()) / px);
    const start = Math.min(1440 - dur, Math.max(0, snapMinutes(pointerMin)));
    const end = start + dur;
    return { dow, start, end, valid: !hasOverlap(rows, dow, start, end) };
  }, [laneUnder, px, rows, trackLeft]);

  // última instância (o listener do document sobrevive a re-renders)
  const libPreviewRef = useRef(libPreview);
  libPreviewRef.current = libPreview;

  const onDragStart = useCallback((ev: DragStartEvent) => {
    const d = ev.active.data.current as { kind?: string; genre?: GenreRow } | undefined;
    if (d?.kind === "library" && d.genre) {
      libGenre.current = d.genre;
      setLibActive(d.genre);
      const ae = ev.activatorEvent as PointerEvent | undefined;
      rawPointer.current = { x: ae?.clientX ?? 0, y: ae?.clientY ?? 0 };
      const track = (e: PointerEvent) => {
        rawPointer.current = { x: e.clientX, y: e.clientY };
        // reatividade: preview direto no pointermove (capture dispara antes do ciclo dnd-kit)
        setPreview(libPreviewRef.current());
      };
      rawTrackRef.current = track;
      document.addEventListener("pointermove", track, true);
    }
  }, []);

  const onDragMove = useCallback(() => setPreview(libPreviewRef.current()), []);

  // WYSIWYG: cai o preview que estava visível (o que você vê é o que grava)
  const onDragEnd = useCallback(() => {
    stopRawTrack();
    const genre = libGenre.current;
    const p = previewRef.current;
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
  }, [addBlock, stopRawTrack]);

  const onDragCancel = useCallback(() => {
    stopRawTrack();
    libGenre.current = null;
    setLibActive(null);
    setPreview(null);
  }, [stopRawTrack]);

  // ---- ações contextuais + atalhos ----
  const selected = rows.find((r) => r.id === selId) ?? null;

  const duplicate = useCallback(
    (row: ScheduleRow) => {
      const dur = toMin(row.endTime) - toMin(row.startTime);
      const slot = firstFreeSlot(rows, row.dayOfWeek, dur, toMin(row.endTime));
      if (!slot) return;
      void addBlock(
        row.program.genre
          ? {
              genreId: row.program.genre.id,
              dayOfWeek: row.dayOfWeek,
              startTime: minutesToHHMM(slot.start),
              endTime: minutesToHHMM(slot.end),
            }
          : {
              programId: row.program.id,
              dayOfWeek: row.dayOfWeek,
              startTime: minutesToHHMM(slot.start),
              endTime: minutesToHHMM(slot.end),
            },
      );
    },
    [addBlock, rows],
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
        if (
          selected &&
          window.confirm(
            `Remover o bloco "${selected.program.name}" (${DOWS[selected.dayOfWeek][0]} ${selected.startTime}–${selected.endTime})?`,
          )
        )
          void deleteBlock(selected);
      } else if (e.key.toLowerCase() === "d" && selected) {
        e.preventDefault();
        duplicate(selected);
      } else if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModal({});
      } else if (e.key === "Escape") {
        setSelId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteBlock, duplicate, modal, sched, selected]);

  // ---- zoom: escada de degraus (auto incluído) com âncora no centro da janela ----
  const laneNames = useMemo(() => DOWS.map(([, full]) => full), []);
  // auto (~0.9) não é um degrau: ações sempre andam degrau a degrau e param nas pontas,
  // em vez de saltar (antes: menos-zoom no mínimo voltava pro auto, que AUMENTAVA o zoom)
  const anchorMin = useRef<number | null>(null);
  const changeZoomRaw = (next: Zoom) => {
    const sc = scrollerRef.current;
    if (sc && sc.clientWidth)
      anchorMin.current = (sc.scrollLeft + sc.clientWidth / 2 - LABEL_W) / px;
    setZoom(next);
  };
  const zoomIn = () => {
    const next = ZOOM_STEPS.find((z) => z > px + 0.01);
    if (!next) return; // teto
    changeZoomRaw(clampedPx(next));
  };
  const zoomOut = () => {
    const prev = [...ZOOM_STEPS].reverse().find((z) => z < px - 0.01);
    if (!prev) return; // piso
    changeZoomRaw(clampedPx(prev));
  };
  const atCeiling = !ZOOM_STEPS.some((z) => z > px + 0.01);
  const atFloor = !ZOOM_STEPS.some((z) => z < px - 0.01);
  useEffect(() => {
    const m = anchorMin.current;
    if (m == null) return;
    anchorMin.current = null;
    const sc = scrollerRef.current;
    if (!sc) return;
    sc.scrollLeft = Math.max(0, m * px + LABEL_W - sc.clientWidth / 2);
  }, [px]);

  const byDay = DOWS.map((_, dow) =>
    rows.filter((r) => r.dayOfWeek === dow).sort((a, b) => toMin(a.startTime) - toMin(b.startTime)),
  );

  // toast pós-apply de perfil (some sozinho)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const pill = sched.saving ? (
    <StatusPill tone="signal" pulse text="salvando…" />
  ) : sched.status.kind === "error" ? (
    <span title={sched.status.msg ?? "falha ao salvar"}>
      <StatusPill tone="red" text="falhou (desfeito)" />
    </span>
  ) : sched.status.kind === "ok" ? (
    <StatusPill tone="green" text="salvo" />
  ) : (
    <StatusPill tone="muted" text="sem alterações" />
  );

  if (isMobile) return <GradeMobile />;

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Grade de Programação</h1>
          <p className="text-xs text-muted">
            arraste da biblioteca · corpo = mover · bordas = redimensionar · clique = selecionar ·
            fora dos blocos: seleção automática
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toast && <StatusPill tone="green" text={toast} />}
          {pill}
          <div
            className="flex h-8 items-center gap-0.5 rounded-lg border border-muted/10 bg-surface p-1 shadow-sm shadow-black/10"
            title="Desfazer (Ctrl+Z) / Refazer (Ctrl+Y)"
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={() => void sched.undo()}
              disabled={sched.saving}
              title="Desfazer (Ctrl+Z)"
            >
              <Undo2 size={15} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={() => void sched.redo()}
              disabled={sched.saving}
              title="Refazer (Ctrl+Y)"
            >
              <Redo2 size={15} />
            </Button>
          </div>
          <ProfilesMenu
            gradeCount={rows.length}
            onApplied={(orphans) => {
              sched.resetHistory();
              notify(
                orphans
                  ? `perfil aplicado — ${orphans} bloco(s) de gênero removido ficará na seleção automática`
                  : "perfil aplicado — grade substituída",
              );
            }}
            onCleared={(removed) => {
              sched.resetHistory();
              notify(
                `grade limpa — ${removed} bloco(s) removido(s) (seleção automática até programar de novo)`,
              );
            }}
          />
          <div
            className="flex h-8 items-center gap-0.5 rounded-lg border border-muted/10 bg-surface p-1 shadow-sm shadow-black/10"
            title="Zoom da timeline"
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={zoomOut}
              disabled={atFloor}
              title="Menos zoom"
            >
              <ZoomOut size={15} />
            </Button>
            <Dropdown
              trigger={
                <span className="min-w-9 text-center font-mono">
                  {zoom === "auto" ? "auto" : String(zoom)}
                </span>
              }
              options={[
                { value: "auto", label: "auto" },
                ...ZOOM_STEPS.map((z) => ({ value: String(z), label: String(z) })),
              ]}
              activeValue={String(zoom)}
              onSelect={(v) =>
                v === "auto" ? changeZoomRaw("auto") : changeZoomRaw(clampedPx(Number(v)))
              }
              title="Zoom da timeline (px por minuto)"
            />
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={zoomIn}
              disabled={atCeiling}
              title="Mais zoom"
            >
              <ZoomIn size={15} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={"h-6 px-1.5 " + (zoom === "auto" ? "text-signal" : "")}
              onClick={() => changeZoomRaw("auto")}
              title="Ajustar a semana inteira na tela (auto)"
            >
              <Maximize size={15} />
            </Button>
          </div>
          <Button
            variant="signal"
            className="flex h-8 items-center"
            onClick={() => setModal({ dow: now.dow })}
            title="Programar bloco (N)"
          >
            <span className="flex items-center gap-1.5">
              <Plus size={15} /> Programar
            </span>
          </Button>
        </div>
      </div>

      {sched.isLoading ? (
        <Spinner />
      ) : (
        <DndContext
          sensors={sensors}
          modifiers={[anchorOnCursor]}
          onDragStart={onDragStart}
          onDragMove={onDragMove}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
        >
          <div className={"flex items-start gap-3" + (libActive ? " cursor-copy" : "")}>
            <LibraryPanel
              open={libOpen}
              onToggle={() => setLibOpen((v) => !v)}
              onNewBlock={() => setModal({})}
            />
            <Card flush className="min-w-0 flex-1">
              <div
                ref={scrollerRefCb}
                className="overflow-y-auto overflow-x-auto rounded-lg"
                style={{ maxHeight: "calc(100vh - 170px)" }}
              >
                <div style={{ width: LABEL_W + 1440 * px + 2 }} className="relative">
                  {/* régua (sticky) — altura fixa: os rótulos ficam NELA, não sobre a 1ª trilha */}
                  <div className="sticky top-0 z-30 flex h-7 border-b border-muted/20 bg-surface">
                    <div className="sticky left-0 z-40 h-7 w-20 shrink-0 border-r border-muted/20 bg-surface" />
                    <div className="relative" style={{ width: 1440 * px }}>
                      {Array.from({ length: 25 }, (_, h) => (
                        <div
                          key={h}
                          className="absolute top-0 flex h-7 items-end"
                          style={{ left: h * hourPx }}
                        >
                          {h < 24 && (px * 60 >= 22 || h % 3 === 0) ? (
                            <span className="pl-1 font-mono text-[10px] text-muted">
                              {String(h % 24).padStart(2, "0")}h
                            </span>
                          ) : null}
                        </div>
                      ))}
                      {/* pill de horário na régua durante o arraste da biblioteca */}
                      {libActive && preview && (
                        <div
                          className="pointer-events-none absolute inset-y-0 z-40"
                          style={{ left: preview.start * px }}
                        >
                          <span className="absolute left-0 -translate-x-1/2 rounded bg-signal px-1 pt-0.5 font-mono text-[10px] font-bold leading-none text-background">
                            {minutesToHHMM(preview.start)}
                          </span>
                        </div>
                      )}
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
                      onAirBlockId={onAirBlockId}
                      guideMin={libActive && preview ? preview.start : null}
                      selectedId={selId}
                      pendingIds={pendingIds}
                      preview={preview}
                      registerTrack={registerTrack}
                      onPick={onPick}
                      onPickMove={onPickMove}
                      onPickUp={onPickUp}
                      onOpen={(row) => setSelId(row.id)}
                      onDuplicate={duplicate}
                      onDelete={(row) => {
                        void deleteBlock(row);
                        setSelId(null);
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="border-t border-muted/10 px-3 py-2 text-[11px] text-muted">
                arrastar = mover · bordas = redimensionar · clique = selecionar · <kbd>N</kbd> novo
                · <kbd>D</kbd> duplicar · <kbd>Del</kbd> excluir · <kbd>Ctrl+Z</kbd>/
                <kbd>Ctrl+Y</kbd>
              </div>
            </Card>
          </div>
          <DragOverlay dropAnimation={null}>
            {libActive ? (
              <div
                className="rounded-lg border bg-surface px-2 py-1.5 text-xs shadow-lg shadow-black/40"
                style={{ borderLeft: `3px solid ${libActive.color}` }}
              >
                {libActive.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {modal && (
        <BlockModal state={modal} rows={rows} onClose={() => setModal(null)} onCreate={addBlock} />
      )}
    </div>
  );
}
