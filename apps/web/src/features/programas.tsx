/** Programas — lista simples (a grade cria os auto-programas). */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type GenreRow, type ProgramRow } from "../lib/api";
import { Badge, Button, Card, Empty, ErrorMsg, Field, Spinner } from "../components/ui";
import { GenreIcon } from "../lib/icons";

export default function Programas() {
  const qc = useQueryClient();
  const { data: programs } = useQuery({ queryKey: ["programs"], queryFn: () => api.get<ProgramRow[]>("/programs") });
  const { data: genres } = useQuery({ queryKey: ["genres"], queryFn: () => api.get<GenreRow[]>("/genres") });
  const [name, setName] = useState("");
  const [genreId, setGenreId] = useState("");

  const create = useMutation({
    mutationFn: () => api.post("/programs", { name, genreId: genreId || null }),
    onSuccess: () => {
      setName("");
      setGenreId("");
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/programs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["programs"] }),
  });

  return (
    <div>
      <h1 className="mb-1 text-xl font-bold">Programas</h1>
      <p className="mb-4 text-sm text-muted">Normalmente criados pela Grade (um por gênero). Blocos fora da grade não os usam.</p>

      <Card className="mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Nome">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jornal da Tarde" className="w-56" />
          </Field>
          <Field label="Gênero (opcional)">
            <select value={genreId} onChange={(e) => setGenreId(e.target.value)} className="w-56">
              <option value="">— sem gênero —</option>
              {(genres ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="signal" onClick={() => create.mutate()} disabled={!name || create.isPending}>
            Criar
          </Button>
          <ErrorMsg error={create.error} />
        </div>
      </Card>

      {!programs ? (
        <Spinner />
      ) : programs.length === 0 ? (
        <Empty>Nenhum programa.</Empty>
      ) : (
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="pb-2 font-medium">Nome</th>
                <th className="pb-2 font-medium">Gênero</th>
                <th className="pb-2 font-medium">Blocos na grade</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {programs.map((p) => (
                <tr key={p.id} className="border-t border-muted/10">
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="py-2 text-muted">{p.genre ? <span className="flex items-center gap-1"><GenreIcon name={p.genre.icon} size={13} /> {p.genre.name}</span> : "—"}</td>
                  <td className="py-2">{p._count?.schedule ?? 0}</td>
                  <td className="py-2">{p.status === "active" ? <Badge tone="green">ativo</Badge> : <Badge>inativo</Badge>}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => del.mutate(p.id)}>
                      remover
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
