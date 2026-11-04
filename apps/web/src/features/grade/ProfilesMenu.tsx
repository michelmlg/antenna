/**
 * Menu "Perfis" da grade: salvar a semana atual como perfil, aplicar um perfil
 * (substitui TODA a grade, com confirmação), excluir perfis e limpar a grade.
 * Apply reseta o undo/redo local — trocar de programação = aplicar outro perfil.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronDown, Eraser, Save, Trash2 } from "lucide-react";
import { api, type ScheduleProfileListRow } from "../../lib/api";
import { plural } from "../../lib/format";
import {
  Button,
  ErrorMsg,
  Field,
  IconButton,
  MenuDivider,
  MenuItem,
  MenuLabel,
  Modal,
  Popover,
  cn,
  useToast,
} from "../../components/ui";

interface Props {
  /** chamado após um apply bem-sucedido (grade + histórico local são invalidados) */
  onApplied(orphanBlocks: number): void;
  /** chamado após limpar a grade atual */
  onCleared(removed: number): void;
  /** nº de blocos na grade atual (0 desabilita salvar/limpar) */
  gradeCount: number;
}

export function ProfilesMenu({ onApplied, onCleared, gradeCount }: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const [saveModal, setSaveModal] = useState(false);

  const { data: profiles } = useQuery({
    queryKey: ["schedule-profiles"],
    queryFn: () => api.get<ScheduleProfileListRow[]>("/schedule/profiles"),
  });

  async function apply(p: ScheduleProfileListRow) {
    if (
      !window.confirm(
        `Aplicar o perfil "${p.name}"? A grade atual será SUBSTITUÍDA pelos ${plural(p._count.blocks, "bloco", "blocos")} do perfil.`,
      )
    )
      return;
    try {
      const res = await api.post<{ orphans: number }>(`/schedule/profiles/${p.id}/apply`);
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      onApplied(res.orphans);
    } catch (e) {
      toast(`Não aplicou: ${(e as Error).message}`, { tone: "error" });
    }
  }

  async function remove(p: ScheduleProfileListRow) {
    if (!window.confirm(`Excluir o perfil "${p.name}"? A grade atual não é afetada.`)) return;
    try {
      await api.del(`/schedule/profiles/${p.id}`);
      await qc.invalidateQueries({ queryKey: ["schedule-profiles"] });
      toast("Perfil excluído");
    } catch (e) {
      toast(`Não excluiu: ${(e as Error).message}`, { tone: "error" });
    }
  }

  async function clearGrade() {
    if (
      !window.confirm(
        `Remover ${gradeCount === 1 ? "o bloco" : `TODOS os ${gradeCount} blocos`} da grade atual? Perfis salvos não são afetados — o canal fica na seleção automática até você programar ou aplicar um perfil.`,
      )
    )
      return;
    try {
      const res = await api.del<{ ok: boolean; removed: number }>("/schedule");
      await qc.invalidateQueries({ queryKey: ["schedule"] });
      onCleared(res.removed);
    } catch (e) {
      toast(`Não limpou: ${(e as Error).message}`, { tone: "error" });
    }
  }

  return (
    <>
      <Popover
        panelClassName="w-72"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            title="Perfis de programação"
            className={cn(
              "inline-flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px] font-medium text-fg transition-colors duration-150",
              "hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
              open && "bg-raised",
            )}
          >
            <Bookmark className="h-4 w-4 text-sub" aria-hidden />
            Perfis
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-dim transition-transform duration-200",
                open && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        )}
      >
        {({ close }) => (
          <>
            <MenuLabel>Perfis salvos</MenuLabel>
            <div className="max-h-64 overflow-y-auto">
              {(profiles ?? []).length === 0 ? (
                <p className="px-3 py-3 text-[13px] text-dim">Nenhum perfil salvo ainda.</p>
              ) : (
                (profiles ?? []).map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center gap-1 rounded-lg pr-1 transition-colors hover:bg-element"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        void apply(p);
                      }}
                      title="Aplicar (substitui a grade atual)"
                      className="min-w-0 flex-1 px-3 py-2 text-left focus-visible:outline-none"
                    >
                      <div className="truncate text-[13px] text-fg">{p.name}</div>
                      <div className="text-[11px] text-dim">
                        {plural(p._count.blocks, "bloco", "blocos")}
                      </div>
                    </button>
                    <IconButton
                      icon={Trash2}
                      label="Excluir perfil"
                      size="sm"
                      tone="danger"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      onClick={() => void remove(p)}
                    />
                  </div>
                ))
              )}
            </div>
            <MenuDivider />
            <MenuItem
              icon={<Save className="h-4 w-4" />}
              disabled={gradeCount === 0}
              onClick={() => {
                close();
                setSaveModal(true);
              }}
            >
              Salvar grade atual como perfil…
            </MenuItem>
            <MenuItem
              danger
              icon={<Eraser className="h-4 w-4" />}
              disabled={gradeCount === 0}
              onClick={() => {
                close();
                void clearGrade();
              }}
            >
              Limpar grade atual…
            </MenuItem>
          </>
        )}
      </Popover>

      {saveModal && <SaveProfileModal onClose={() => setSaveModal(false)} />}
    </>
  );
}

function SaveProfileModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [err, setErr] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
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
      toast(`Perfil "${name.trim()}" salvo`);
      onClose();
    } catch (e) {
      setErr(e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Salvar perfil de programação"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            loading={saving}
            onClick={() => void save()}
          >
            Salvar perfil
          </Button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-dim">
        Guarda a grade semanal atual (todos os blocos, com os gêneros do momento). Depois você
        aplica qualquer perfil para trocar a programação do canal.
      </p>
      <Field label="Nome do perfil">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && void save()}
          placeholder="ex.: Programação de férias"
          maxLength={80}
          className="w-full"
        />
      </Field>
      <ErrorMsg error={err} className="mt-3" />
    </Modal>
  );
}
