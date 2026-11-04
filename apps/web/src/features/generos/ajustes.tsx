/** Aba Ajustes: identidade (ícone, nome, cor), seleção, anti-repetição, status e exclusão. */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import { api, type GenreDetail } from "../../lib/api";
import { DEFAULT_GENRE_ICON } from "../../lib/icons";
import { Button, Card, ErrorMsg, Field, SettingRow, Switch, useToast } from "../../components/ui";
import { IdentityFields } from "./GenreForm";
import { ORDERINGS } from "./shared";

export function AjustesTab({ genre }: { genre: GenreDetail }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const initial = {
    name: genre.name,
    icon: genre.icon || DEFAULT_GENRE_ICON,
    color: genre.color,
    status: genre.status,
    antiRepeatWindow: genre.antiRepeatWindow,
    orderingPadrao: genre.orderingPadrao,
  };
  const [d, setD] = useState(initial);
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const edit = (patch: Partial<typeof d>) => setD((prev) => ({ ...prev, ...patch }));

  const save = useMutation({
    mutationFn: () => api.put(`/genres/${genre.id}`, { ...d, name: d.name.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["genre", genre.id] });
      qc.invalidateQueries({ queryKey: ["genres"] });
      qc.invalidateQueries({ queryKey: ["schedule"] }); // nome/cor/ícone aparecem nos blocos
      toast("Gênero salvo");
    },
  });
  const del = useMutation({
    mutationFn: () => api.del(`/genres/${genre.id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["genres"] });
      qc.invalidateQueries({ queryKey: ["schedule"] });
      toast(`${genre.name} excluído`, { icon: Trash2 });
      navigate("/generos");
    },
  });

  return (
    <div className="max-w-2xl space-y-6">
      <IdentityFields name={d.name} icon={d.icon} color={d.color} onChange={edit} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Seleção" hint="Como escolher o próximo vídeo dentro de cada ingrediente.">
          <select
            value={d.orderingPadrao}
            onChange={(e) => edit({ orderingPadrao: e.target.value })}
          >
            {ORDERINGS.map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Anti-repetição" hint="Não repete nenhum dos últimos N exibidos.">
          <input
            type="number"
            min={1}
            max={100}
            value={d.antiRepeatWindow}
            onChange={(e) => edit({ antiRepeatWindow: Number(e.target.value) })}
          />
        </Field>
      </div>

      <div className="border-t border-line">
        <SettingRow
          title="Gênero ativo"
          description="Pausado, ele não entra na fila — as fontes continuam guardadas."
        >
          <Switch
            label={d.status === "ativo" ? "Pausar gênero" : "Ativar gênero"}
            checked={d.status === "ativo"}
            onChange={(on) => edit({ status: on ? "ativo" : "pausado" })}
          />
        </SettingRow>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          disabled={!dirty || !d.name.trim()}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          Salvar
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setD(initial)}>
            Descartar
          </Button>
        )}
      </div>
      <ErrorMsg error={save.error} />

      <Card className="mt-10 flex flex-wrap items-center justify-between gap-4 border-danger/25 p-4">
        <div>
          <div className="text-sm">Excluir gênero</div>
          <div className="text-[13px] text-dim">
            Remove fontes, links e o programa da grade. Não dá para desfazer.
          </div>
        </div>
        <Button
          variant="danger"
          icon={Trash2}
          loading={del.isPending}
          onClick={() =>
            window.confirm(
              `Excluir "${genre.name}" e o programa dele na grade? Não dá para desfazer.`,
            ) && del.mutate()
          }
        >
          Excluir
        </Button>
      </Card>
      <ErrorMsg error={del.error} />
    </div>
  );
}
