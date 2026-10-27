/**
 * Grade de Programação — timeline semanal (layout A do PLANO.md §16.1):
 * 7 trilhas horizontais, régua compartilhada, blocos arrastáveis/redimensionáveis.
 * Toolbar no topo do card, biblioteca em gaveta abaixo (timeline em largura total).
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
import {
  AlertCircle,
  Check,
  CircleCheck,
  Loader2,
  Maximize,
  PanelBottom,
  Plus,
  Redo2,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { GenreRow, ScheduleRow } from "../../lib/api";
import { useLocalStorage, useMediaQuery, useNow } from "../../lib/hooks";
import { usePlayoutState } from "../../lib/queries";
import { GenreTile } from "../../components/GenreTile";
import {
  Button,
  Card,
  Dropdown,
  IconButton,
  Kbd,
  Spinner,
  cn,
  useToast,
} from "../../components/ui";
import {
  DISPLAY_ORDER,
  DOWS,
  LABEL_W,
  clampedPx,
  cursorMinute,
  hasOverlap,
  minutesToHHMM,
  pxPerMinAuto,
  snapMinutes,
  toMin,
} from "./time";
import { useGradeSchedule, type MutationResult, type SchedulePatch } from "./useScheduleMutations";
import { DayLane, type Preview } from "./DayLane";
import { LibraryDrawer, firstFreeSlot } from "./LibraryDrawer";
import { BlockModal, type ModalState } from "./BlockModal";
import { ProfilesMenu } from "./ProfilesMenu";
import GradeMobile from "./GradeMobile";

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

const Divider = () => <span aria-hidden className="mx-1 hidden h-5 w-px bg-line sm:block" />;

export default function Grade() {
  const isMobile = useMediaQuery("(max-width: 767px)");
  // hooks de dados ficam no componente do desktop: o celular tem a própria tela
  return isMobile ? <GradeMobile /> : <GradeDesktop />;
}

function GradeDesktop() {
  const toast = useToast();
  const sched = useGradeSchedule();
  const { rows, updateBlock, addBlock, deleteBlock } = sched;

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
  const clock = useNow(30_000);
  const now = { dow: clock.getDay(), min: clock.getHours() * 60 + clock.getMinutes() };

  const { data: playout } = usePlayoutState();
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
  }, [playout, rows, now.dow, now.min]);

  const [selId, setSelId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [zoom, setZoom] = useState<Zoom>("auto");
  const [drawerOpen, setDrawerOpen] = useLocalStorage("antenna.grade.drawer", true);
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

  const px = zoom === "auto" ? pxPerMinAuto(viewW) : zoom;
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
    [],
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
      if (!changed) return;
      if (!p.valid) {
        toast("Esse horário já tem outro bloco", { tone: "error" });
        return; // inválido → volta ao lugar (sem salvar)
      }
      void updateTracked(d.id, {
        dayOfWeek: p.dow,
        startTime: minutesToHHMM(p.start),
        endTime: minutesToHHMM(p.end),
      });
    },
    [toast, updateTracked],
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
    if (!libGenre.current) return null;
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
    if (!p.valid) {
      toast("Sem espaço livre nesse horário", { tone: "error" });
      return;
    }
    void addBlock({
      genreId: genre.id,
      dayOfWeek: p.dow,
      startTime: minutesToHHMM(p.start),
      endTime: minutesToHHMM(p.end),
    });
  }, [addBlock, stopRawTrack, toast]);

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
      if (!slot) {
        toast(`Sem horário livre em ${DOWS[row.dayOfWeek][1].toLowerCase()} para duplicar`, {
          tone: "error",
        });
        return;
      }
      const at = {
        dayOfWeek: row.dayOfWeek,
        startTime: minutesToHHMM(slot.start),
        endTime: minutesToHHMM(slot.end),
      };
      void addBlock(
        row.program.genre
          ? { genreId: row.program.genre.id, ...at }
          : { programId: row.program.id, ...at },
      ).then((r) => r === true && toast(`Duplicado para ${at.startTime}–${at.endTime}`));
    },
    [addBlock, rows, toast],
  );

  const remove = useCallback(
    (row: ScheduleRow) => {
      setSelId(null);
      void deleteBlock(row).then(
        (r) => r === true && toast("Bloco excluído · Ctrl+Z desfaz", { icon: Trash2 }),
      );
    },
    [deleteBlock, toast],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modal || document.querySelector("[role=dialog]")) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      const ctl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (ctl && key === "z") {
        e.preventDefault();
        if (e.shiftKey) void sched.redo();
        else void sched.undo();
      } else if (ctl && key === "y") {
        e.preventDefault();
        void sched.redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (
          selected &&
          window.confirm(
            `Remover o bloco "${selected.program.name}" (${DOWS[selected.dayOfWeek][0]} ${selected.startTime}–${selected.endTime})?`,
          )
        )
          remove(selected);
      } else if (ctl) {
        return;
      } else if (key === "d" && selected) {
        e.preventDefault();
        duplicate(selected);
      } else if (key === "n") {
        e.preventDefault();
        setModal({ dow: now.dow });
      } else if (key === "b") {
        setDrawerOpen((v) => !v);
      } else if (e.key === "Escape") {
        setSelId(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [duplicate, modal, now.dow, remove, sched, selected, setDrawerOpen]);

  // ---- zoom: escada de degraus com âncora no centro da janela ----
  const anchorMin = useRef<number | null>(null);
  const changeZoom = (next: Zoom) => {
    const sc = scrollerRef.current;
    if (sc && sc.clientWidth)
      anchorMin.current = (sc.scrollLeft + sc.clientWidth / 2 - LABEL_W) / px;
    setZoom(next);
  };
  // auto (~0.9) não é um degrau: ações sempre andam degrau a degrau e param nas pontas
  const nextUp = ZOOM_STEPS.find((z) => z > px + 0.01);
  const nextDown = [...ZOOM_STEPS].reverse().find((z) => z < px - 0.01);
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

  const saveState = sched.saving ? (
    <>
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Salvando…
    </>
  ) : sched.status.kind === "error" ? (
    <span className="flex items-center gap-1.5 text-danger" title={sched.status.msg}>
      <AlertCircle className="h-3.5 w-3.5" aria-hidden /> Falhou — desfeito
    </span>
  ) : sched.status.kind === "ok" ? (
    <>
      <Check className="h-3.5 w-3.5 text-ok" aria-hidden /> Salvo · vale no próximo tick
    </>
  ) : (
    <>
      <CircleCheck className="h-3.5 w-3.5" aria-hidden /> Tudo salvo
    </>
  );

  return (
    <div className="flex flex-col">
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
          <Card className={cn("overflow-visible", libActive && "cursor-copy")}>
            {/* ---------- toolbar da timeline ---------- */}
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2.5">
              <ProfilesMenu
                gradeCount={rows.length}
                onApplied={(orphans) => {
                  sched.resetHistory();
                  toast(
                    orphans
                      ? `Perfil aplicado — ${orphans} bloco(s) de gênero removido ficam na seleção automática`
                      : "Perfil aplicado — grade substituída",
                  );
                }}
                onCleared={(removed) => {
                  sched.resetHistory();
                  toast(`Grade limpa — ${removed} bloco(s) removido(s)`);
                }}
              />
              <Divider />
              <IconButton
                icon={Undo2}
                label="Desfazer (Ctrl+Z)"
                onClick={() => void sched.undo()}
                disabled={sched.saving}
              />
              <IconButton
                icon={Redo2}
                label="Refazer (Ctrl+Y)"
                onClick={() => void sched.redo()}
                disabled={sched.saving}
              />
              <Divider />
              <IconButton
                icon={ZoomOut}
                label="Menos zoom"
                disabled={!nextDown}
                onClick={() => nextDown && changeZoom(clampedPx(nextDown))}
              />
              <Dropdown
                title="Zoom da timeline (px por minuto)"
                value={String(zoom)}
                options={[
                  { value: "auto", label: "auto" },
                  ...ZOOM_STEPS.map((z) => ({ value: String(z), label: `${z}×` })),
                ]}
                onSelect={(v) => changeZoom(v === "auto" ? "auto" : clampedPx(Number(v)))}
                renderLabel={(o) => <span className="min-w-8 text-center tnum">{o?.label}</span>}
              />
              <IconButton
                icon={ZoomIn}
                label="Mais zoom"
                disabled={!nextUp}
                onClick={() => nextUp && changeZoom(clampedPx(nextUp))}
              />
              <IconButton
                icon={Maximize}
                label="Semana inteira na tela (auto)"
                active={zoom === "auto"}
                onClick={() => changeZoom("auto")}
              />
              <span
                className="ml-2 hidden items-center gap-1.5 text-xs text-dim lg:flex"
                aria-live="polite"
              >
                {saveState}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={PanelBottom}
                  className={cn(drawerOpen && "text-brand hover:text-brand")}
                  aria-pressed={drawerOpen}
                  onClick={() => setDrawerOpen((v) => !v)}
                  title="Mostrar/ocultar biblioteca (B)"
                >
                  Biblioteca
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={Plus}
                  onClick={() => setModal({ dow: now.dow })}
                  title="Programar bloco (N)"
                >
                  Programar
                </Button>
              </div>
            </div>

            {/* ---------- timeline ---------- */}
            <div
              ref={scrollerRefCb}
              className="overflow-auto"
              style={{
                maxHeight: drawerOpen ? "calc(100vh - 340px)" : "calc(100vh - 230px)",
                minHeight: 280,
              }}
            >
              <div style={{ width: LABEL_W + 1440 * px + 2 }} className="relative">
                {/* régua (sticky) */}
                <div className="sticky top-0 z-30 flex h-8 border-b border-line bg-panel">
                  <div
                    className="sticky left-0 z-40 h-8 shrink-0 border-r border-line bg-panel"
                    style={{ width: LABEL_W }}
                  />
                  <div className="relative" style={{ width: 1440 * px }}>
                    {Array.from({ length: 24 }, (_, h) =>
                      hourPx >= 22 || h % 3 === 0 ? (
                        <span
                          key={h}
                          className="absolute bottom-1.5 pl-1.5 text-[11px] text-dim tnum"
                          style={{ left: h * hourPx }}
                        >
                          {String(h).padStart(2, "0")}h
                        </span>
                      ) : null,
                    )}
                    {/* horário na régua durante o arraste da biblioteca */}
                    {libActive && preview && (
                      <span
                        className="pointer-events-none absolute bottom-1 z-40 -translate-x-1/2 rounded bg-brand px-1 text-[10px] font-semibold text-brand-ink tnum"
                        style={{ left: preview.start * px }}
                      >
                        {minutesToHHMM(preview.start)}
                      </span>
                    )}
                  </div>
                </div>
                {DISPLAY_ORDER.map((dow) => (
                  <DayLane
                    key={dow}
                    dow={dow}
                    name={DOWS[dow][0]}
                    px={px}
                    hourPx={hourPx}
                    blocks={byDay[dow]}
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
                    onDuplicate={duplicate}
                    onDelete={remove}
                  />
                ))}
              </div>
            </div>

            {/* ---------- rodapé: seleção / atalhos ---------- */}
            <div className="flex min-h-[40px] flex-wrap items-center gap-x-3 gap-y-1 border-t border-line px-4 py-2 text-xs text-dim">
              {selected ? (
                <span className="animate-fade-in">
                  <span className="text-sub">{selected.program.name}</span> ·{" "}
                  {DOWS[selected.dayOfWeek][1]} {selected.startTime}–{selected.endTime} ·{" "}
                  <Kbd>D</Kbd> duplica · <Kbd>Del</Kbd> exclui · <Kbd>Esc</Kbd> limpa a seleção
                </span>
              ) : (
                <span>
                  Arraste da biblioteca para criar · arraste o bloco para mover (inclusive entre
                  dias) · puxe as bordas para redimensionar · <Kbd>N</Kbd> novo · <Kbd>B</Kbd>{" "}
                  biblioteca · <Kbd>Ctrl+Z</Kbd> desfaz
                </span>
              )}
            </div>
          </Card>

          <LibraryDrawer open={drawerOpen} onToggle={() => setDrawerOpen((v) => !v)} rows={rows} />

          <DragOverlay dropAnimation={null}>
            {libActive ? (
              <div className="flex items-center gap-2 rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[13px] shadow-pop">
                <GenreTile icon={libActive.icon} color={libActive.color} size="xs" />
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
