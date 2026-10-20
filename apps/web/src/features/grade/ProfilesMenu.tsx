/**
 * Dropdown "Perfis" da grade: salvar a semana atual como perfil, aplicar um
 * perfil (substitui TODA a grade, com confirmação) e excluir perfis.
 * Apply reseta o undo/redo local — trocar de programação = aplicar outro perfil.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronDown, Eraser, Trash2 } from "lucide-react";
import { Badge, Button, Field, Modal } from "../../components/ui";
import { api, type ScheduleProfileListRow } from "../../lib/api";

interface Props {
  /** chamado após um apply bem-sucedido (grade + histórico local são invalidados) */
  onApplied(orphanBlocks: number): void;
  /** chamado após limpar a grade atual */
  onCleared(removed: number): void;
  /** nº de blocos na grade atual (0 desabilita salvar/limpar) */
  gradeCount: number;
  disabled?: boolean;
}

export function ProfilesMenu({ onApplied, onCleared, gradeCount, disabled }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saveModal, setSaveModal] = useState(false);
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const { data: profiles } = useQuery({
    queryKey: ["schedule-profiles"],
    queryFn: () => api.get<ScheduleProfileListRow[]>("/schedule/profiles"),
  });

  // fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  async function saveCurrent() {
    setSaving(true);
    setErr(null);
    try {
      const rows = await api.get<
        {
          dayOfWeek: number;
          startTime: string;
          endTime: string;
          program: { genre: { id: string } | null };
        }[]
      >("/schedule");
      await api.post("/schedule/profiles", {
        name: name.trim(),
        blocks: rows.map((r) => ({
          dayOfWeek: r.dayOfWeek,
          startTime: r.startTime,
          endTime: r.endTime,
          genreId: r.program.genre?.id,
        })),
      });
      await qc.invalidateQueries({ queryKey: ["schedule-profiles"] });
      setSaveModal(false);
      setName("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function apply(p: ScheduleProfileListRow) {
    if (
      !window.confirm(
        `Aplicar o perfil "${p.name}"? A grade atual (${p._count.blocks === 1 ? "será substituída" : `${p._count.blocks} blocos`} incluída) será SUBSTITUÍDA pelos blocos do perfil.`,
      )
    )
      return;
    try {
      const res = await api.post<{ orphans: number }>("/schedule/profiles/" + p.id + "/apply");
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      setOpen(false);
      onApplied(res.orphans);
    } catch (e) {
      window.alert("Não aplicou: " + (e as Error).message);
    }
  }

  async function remove(p: ScheduleProfileListRow) {
    if (!window.confirm(`Excluir o perfil "${p.name}"? A grade atual não é afetada.`)) return;
    try {
      await api.del("/schedule/profiles/" + p.id);
      await qc.invalidateQueries({ queryKey: ["schedule-profiles"] });
    } catch (e) {
      window.alert("Não excluiu: " + (e as Error).message);
    }
  }

  async function clearGrade() {
    if (
      !window.confirm(
        `Remover TODOS os ${gradeCount} bloco${gradeCount === 1 ? "" : "s"} da grade atual? Perfis salvos não são afetados — a grade fica fora do ar (seleção automática 24h) até você programar ou aplicar um perfil.`,
      )
    )
      return;
    try {
      const res = await api.del<{ ok: boolean; removed: number }>("/schedule");
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      setOpen(false);
      onCleared(res.removed);
    } catch (e) {
      window.alert("Não limpou: " + (e as Error).message);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="default"
        className="flex h-8"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="Perfis de programação"
      >
        <span className="flex items-center gap-1.5">
          <Bookmark size={14} /> Perfis{" "}
          <ChevronDown
            size={12}
            className={open ? "rotate-180 transition-transform" : "transition-transform"}
          />
        </span>
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-muted/20 bg-surface p-2 shadow-xl shadow-black/40 [animation:panel-in_120ms_ease-out]">
          <Button
            size="sm"
            variant="signal"
            className="w-full"
            onClick={() => setSaveModal(true)}
            disabled={gradeCount === 0}
          >
            Salvar grade atual como…
          </Button>
          <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
            {(profiles ?? []).length === 0 ? (
              <div className="px-2 py-3 text-center text-[11px] text-muted">
                nenhum perfil salvo ainda
              </div>
            ) : (
              (profiles ?? []).map((p) => (
                <div
                  key={p.id}
                  className="group flex items-center justify-between gap-2 rounded-lg border border-muted/10 px-2.5 py-2 hover:bg-muted/10"
                >
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium">{p.name}</div>
                    <div className="text-[10px] text-muted">
                      {p._count.blocks} bloco{p._count.blocks === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => void apply(p)}
                      title="Aplicar (substitui a grade atual)"
                    >
                      Aplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void remove(p)}
                      title="Excluir perfil"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="mt-2 border-t border-muted/10 pt-1.5">
            <Button
              size="sm"
              variant="danger"
              className="w-full"
              onClick={() => void clearGrade()}
              disabled={gradeCount === 0}
            >
              <span className="flex items-center justify-center gap-1.5">
                <Eraser size={13} /> Limpar grade atual…
              </span>
            </Button>
            <div className="mt-1 text-center text-[10px] text-muted">
              salvar só com blocos na grade · aplicar substitui a grade inteira (vale no próximo
              tick)
            </div>
          </div>
        </div>
      )}

      {saveModal && (
        <Modal title="Salvar perfil de programação" onClose={() => setSaveModal(false)}>
          <div className="space-y-3">
            <p className="text-xs text-muted">
              Salva a grade semanal atual (todos os blocos, com os gêneros do momento) como um
              perfil nomeado. Depois você pode aplicar qualquer perfil para trocar a programação do
              canal.
            </p>
            <Field label="Nome do perfil">
              <input
                id="profile-name"
                name="profile-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex.: Programação de férias"
                maxLength={80}
                autoFocus
              />
            </Field>
            {err && <div className="text-xs text-danger">⚠ {err}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={() => setSaveModal(false)}>
                Cancelar
              </Button>
              <Button
                variant="signal"
                onClick={() => void saveCurrent()}
                disabled={!name.trim() || saving}
              >
                {saving ? "salvando…" : "Salvar perfil"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function OrphanBadge() {
  return <Badge tone="red">gênero removido</Badge>;
}
