/** "A seguir" — fila como linhas com miniatura e horário previsto; ações no hover. */
import { ExternalLink, ListVideo, Play } from "lucide-react";
import type { QueueItemView } from "../../lib/api";
import { fmtDur, hhmm } from "../../lib/format";
import { GenreDot } from "../../components/GenreTile";
import { Thumb, thumbOf } from "../../components/Thumb";
import { Empty, IconButton } from "../../components/ui";

export function Rundown({
  items,
  firstStartsAt,
  until,
  onPlay,
}: {
  items: QueueItemView[];
  /** epoch ms em que o primeiro item deve entrar (fim do atual); null = desconhecido */
  firstStartsAt: number | null;
  /** fim do bloco atual (epoch ms): depois dele a fila se refaz, então não há horário a prometer */
  until?: number | null;
  onPlay: (mediaId: string) => void;
}) {
  if (!items.length)
    return (
      <Empty icon={ListVideo} title="Fila vazia">
        O worker gera a próxima sequência no próximo tick.
      </Empty>
    );

  let at = firstStartsAt;
  return (
    <ol className="space-y-1">
      {items.map((it, i) => {
        const startsAt = at;
        if (at != null) at += it.duration * 1000;
        return (
          <li
            key={`${it.mediaId}-${i}`}
            className="group flex animate-fade-in items-center gap-3 rounded-lg p-2 transition-colors duration-150 hover:bg-panel focus-within:bg-panel"
          >
            <Thumb
              src={thumbOf(it)}
              fallback={it.source}
              className="h-[54px] w-24 shrink-0 rounded-md"
            />
            <div className="min-w-0 flex-1">
              <div className="line-clamp-2 text-sm leading-snug">{it.title}</div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-dim">
                {it.genre && <GenreDot color={it.genre.color} />}
                {startsAt != null && (until == null || startsAt < until) && (
                  <>
                    <span className="tnum">{hhmm(new Date(startsAt))}</span>
                    <span>·</span>
                  </>
                )}
                <span className="tnum">{fmtDur(it.duration)}</span>
              </div>
            </div>
            {/* sem hover (touch) as ações ficam visíveis */}
            <div className="flex shrink-0 items-center opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 max-xl:opacity-100">
              <IconButton
                icon={Play}
                label="Tocar agora (interrompe o atual e consome este item)"
                onClick={() => onPlay(it.mediaId)}
              />
              {it.source === "youtube" && (
                <a
                  href={it.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Abrir no YouTube"
                  aria-label="Abrir no YouTube"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sub transition-colors hover:bg-raised hover:text-fg"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
