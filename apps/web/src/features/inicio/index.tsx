/**
 * Início — o canal agora: player com marca d'água, o que está no ar e controles,
 * fila "A seguir" com horários previstos e a régua da programação de hoje.
 */
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Play, SkipForward, Square } from "lucide-react";
import { toMin } from "@antenna/core/schedule";
import { fmtDur, hhmm } from "../../lib/format";
import { usePlayoutControls } from "../../lib/playout";
import { usePlayoutState, useSchedule, useStreamInfo } from "../../lib/queries";
import { LivePlayer } from "../../components/LivePlayer";
import { GenreDot } from "../../components/GenreTile";
import { Alert, Button, ErrorMsg, SectionHeader, TextAction, useToast } from "../../components/ui";
import { Rundown } from "./Rundown";
import { TodayRuler } from "./TodayRuler";
import { useElapsed } from "./useElapsed";

export default function Inicio() {
  const navigate = useNavigate();
  const toast = useToast();
  const { data: state } = usePlayoutState();
  const { data: stream } = useStreamInfo();
  const { data: schedule } = useSchedule();
  const { start, stop, skip, playNow } = usePlayoutControls();

  const cur = state?.current;
  const running = !!state?.running;
  const queue = state?.queue ?? [];
  const { known, elapsed, pct, remaining } = useElapsed(cur?.startedAt, cur?.duration ?? 0);

  const dow = new Date().getDay();
  const today = useMemo(
    () =>
      (schedule ?? [])
        .filter((r) => r.dayOfWeek === dow)
        .sort((a, b) => toMin(a.startTime) - toMin(b.startTime)),
    [schedule, dow],
  );
  // bloco em execução: programa no ar + faixa que contém agora
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const block = today.find(
    (r) =>
      r.program.id === cur?.programId && toMin(r.startTime) <= nowMin && nowMin < toMin(r.endTime),
  );

  const endsAt = known && remaining != null ? Date.now() + remaining * 1000 : null;
  const queueEnds =
    endsAt != null && queue.length
      ? endsAt + queue.reduce((s, i) => s + i.duration, 0) * 1000
      : null;
  const blockEndsAt = block
    ? new Date(new Date().setHours(0, 0, 0, 0) + toMin(block.endTime) * 60_000).getTime()
    : null;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        {/* ---------- no ar ---------- */}
        <section className="min-w-0" aria-label="No ar">
          <LivePlayer
            src={stream ? `${location.origin}${stream.hlsPath}` : null}
            live={running}
            mediaKey={cur?.mediaId}
            progress={known ? pct : null}
            offline={
              <>
                <p className="text-sm text-sub">O canal está fora do ar.</p>
                <Button
                  variant="primary"
                  icon={Play}
                  loading={start.isPending}
                  onClick={() => start.mutate(undefined, { onSuccess: () => toast("Canal no ar") })}
                >
                  Colocar no ar
                </Button>
              </>
            }
          />

          <div className="mt-5 flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              {cur?.programName && (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium">
                  <GenreDot color={block?.program.genre?.color} />
                  <span className="text-sub">{cur.programName}</span>
                  {block && (
                    <span className="text-dim tnum">
                      · bloco {block.startTime} – {block.endTime}
                    </span>
                  )}
                  {cur.isFallback && <span className="text-danger">· vídeo de reserva</span>}
                </div>
              )}
              <h2 className="mt-1.5 line-clamp-2 text-xl font-semibold leading-snug">
                {cur ? cur.title : running ? "Sintonizando…" : "Nada no ar"}
              </h2>
              <p className="mt-1 text-sm text-dim tnum">
                {cur ? (
                  <>
                    {fmtDur(elapsed)}
                    {known ? ` de ${fmtDur(cur.duration)}` : " · duração desconhecida"}
                    {endsAt != null && ` · termina às ${hhmm(new Date(endsAt))}`}
                  </>
                ) : running ? (
                  "aguardando o primeiro item"
                ) : (
                  "playout parado"
                )}
                {running && stream?.viewers != null && (
                  <>
                    {" · "}
                    <Link
                      to="/assistir"
                      className="text-sub underline-offset-2 hover:text-fg hover:underline"
                    >
                      {stream.viewers} assistindo
                    </Link>
                  </>
                )}
              </p>
            </div>
            {running && (
              <div className="flex items-center gap-2">
                <Button
                  icon={Square}
                  loading={stop.isPending}
                  onClick={() =>
                    stop.mutate(undefined, { onSuccess: () => toast("Canal fora do ar") })
                  }
                >
                  Parar
                </Button>
                <Button
                  variant="primary"
                  icon={SkipForward}
                  loading={skip.isPending}
                  onClick={() =>
                    skip.mutate(undefined, {
                      onSuccess: () => toast("Pulando para o próximo vídeo"),
                    })
                  }
                >
                  Pular
                </Button>
              </div>
            )}
          </div>

          {state?.lastError && (
            <Alert key={state.lastError} dismissible detail={state.lastError} className="mt-4">
              O último item teve um erro de reprodução — o canal segue com a fila.
            </Alert>
          )}
          <ErrorMsg error={start.error || stop.error || skip.error} className="mt-4" />
        </section>

        {/* ---------- a seguir ---------- */}
        <section className="min-w-0" aria-label="A seguir">
          <SectionHeader
            title="A seguir"
            aside={
              queue.length > 0 && (
                <span className="text-xs text-dim tnum">{queue.length} na fila</span>
              )
            }
          />
          <div className="xl:max-h-[520px] xl:overflow-y-auto">
            <Rundown
              items={queue}
              firstStartsAt={endsAt}
              until={blockEndsAt}
              onPlay={(id) =>
                playNow.mutate(id, { onSuccess: () => toast("Tocando agora", { icon: Play }) })
              }
            />
          </div>
          <ErrorMsg error={playNow.error} className="mt-2" />
          {queue.length > 0 && (
            <p className="mt-3 px-2 text-xs leading-relaxed text-dim">
              {queueEnds != null && (
                <>
                  A fila vai até <span className="text-sub tnum">{hhmm(new Date(queueEnds))}</span>
                  .{" "}
                </>
              )}
              Ela só muda quando você pula ou quando o bloco troca.
            </p>
          )}
        </section>
      </div>

      {/* ---------- programação de hoje ---------- */}
      <section className="mt-10" aria-label="Programação de hoje">
        <SectionHeader
          title="Programação de hoje"
          aside={
            <TextAction icon={ArrowRight} onClick={() => navigate("/grade")}>
              Editar grade
            </TextAction>
          }
        />
        <TodayRuler rows={today} />
      </section>
    </div>
  );
}
