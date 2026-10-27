/** Aba Links manuais: vídeos escolhidos a dedo (entram na mistura pelo ingrediente "Links manuais"). */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link2, Plus } from "lucide-react";
import { api, type GenreDetail, type MediaLite } from "../../lib/api";
import { Button, Card, Empty, ErrorMsg, Field, useToast } from "../../components/ui";
import { MediaGrid } from "./MediaGrid";

export function LinksTab({ genre }: { genre: GenreDetail }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [url, setUrl] = useState("");
  const manual = genre.items.map((it) => ({ ...it.media, itemId: it.id }));

  // vídeo avulso = fonte "video" na API (probe no worker + link manual no gênero)
  const add = useMutation({
    mutationFn: () => api.post(`/genres/${genre.id}/sources`, { type: "video", url: url.trim() }),
    onSuccess: () => {
      setUrl("");
      qc.invalidateQueries({ queryKey: ["genre", genre.id] });
      toast("Vídeo adicionado");
    },
  });
  // "apagar de vez" remove o link E o vídeo (sem a tela Mídias, não há outro caminho)
  const del = useMutation({
    mutationFn: (m: MediaLite & { itemId: string }) =>
      api.del(`/genres/${genre.id}/links/${m.itemId}`).then(() => api.del(`/media/${m.id}`)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["genre"] });
      toast("Vídeo removido");
    },
  });

  return (
    <div className="space-y-5">
      <Card padded>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) add.mutate();
          }}
        >
          <Field label="Adicionar vídeo" className="min-w-[240px] flex-1">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Cole o link do vídeo no YouTube"
              className="w-full"
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            icon={Plus}
            loading={add.isPending}
            disabled={!url.trim()}
          >
            Adicionar
          </Button>
        </form>
        {add.isPending && (
          <p className="mt-2 text-xs text-dim">
            Lendo os dados do vídeo — pode levar alguns segundos…
          </p>
        )}
        <ErrorMsg error={add.error} className="mt-3" />
      </Card>

      {manual.length === 0 ? (
        <Card>
          <Empty icon={Link2} title="Nenhum link manual">
            Vídeos colados aqui entram na mistura pelo ingrediente “Links manuais”.
          </Empty>
        </Card>
      ) : (
        <>
          <p className="text-[13px] text-dim">
            Vídeos escolhidos a dedo. Entram na mistura pelo ingrediente “Links manuais”.
          </p>
          <MediaGrid
            items={manual}
            deleteLabel="Remover (apaga o link e o vídeo)"
            onDelete={(m) => {
              const item = manual.find((x) => x.id === m.id);
              if (
                item &&
                window.confirm(`Apagar "${m.title}" de vez? O link e o vídeo saem da biblioteca.`)
              )
                del.mutate(item);
            }}
          />
          <ErrorMsg error={del.error} />
        </>
      )}
    </div>
  );
}
