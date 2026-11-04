/**
 * Régua do dia — 24h em escala, blocos tingidos pela cor do gênero, agulha no
 * horário atual. Clique leva à grade. Geometria em minutos (igual à grade).
 */
import { useNavigate } from "react-router-dom";
import { CalendarPlus } from "lucide-react";
import { toMin } from "@antenna/core/schedule";
import type { ScheduleRow } from "../../lib/api";
import { alpha } from "../../lib/color";
import { useNow } from "../../lib/hooks";
import { Button } from "../../components/ui";

const pct = (min: number) => `${(Math.min(1440, Math.max(0, min)) / 1440) * 100}%`;

export function TodayRuler({ rows }: { rows: ScheduleRow[] }) {
  const navigate = useNavigate();
  const now = useNow(30_000);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (!rows.length)
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-[13px] text-dim">
        Nada programado hoje — o canal usa a seleção automática.
        <Button size="sm" icon={CalendarPlus} onClick={() => navigate("/grade")}>
          Programar
        </Button>
      </div>
    );

  return (
    <>
      <button
        type="button"
        onClick={() => navigate("/grade")}
        title="Abrir a grade"
        className="relative block h-12 w-full overflow-hidden rounded-lg bg-panel transition-shadow duration-150 hover:ring-1 hover:ring-element focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
      >
        {rows.map((r) => {
          const start = toMin(r.startTime);
          const end = toMin(r.endTime);
          const color = r.program.genre?.color;
          const wide = (end - start) / 1440 >= 0.05;
          return (
            <div
              key={r.id}
              title={`${r.startTime}–${r.endTime} · ${r.program.name}`}
              className="absolute inset-y-1.5 overflow-hidden rounded-md px-2.5 py-1 text-left"
              style={{
                left: `calc(${pct(start)} + 1px)`,
                width: `calc(${((end - start) / 1440) * 100}% - 2px)`,
                background: alpha(color, 0.16),
                boxShadow: `inset 3px 0 0 ${color ?? "transparent"}`,
              }}
            >
              {wide && (
                <>
                  <div className="truncate text-xs font-medium">{r.program.name}</div>
                  <div className="truncate text-[10px] text-sub tnum">
                    {r.startTime}–{r.endTime}
                  </div>
                </>
              )}
            </div>
          );
        })}
        <div className="absolute inset-y-0 w-0.5 bg-brand" style={{ left: pct(nowMin) }}>
          <i className="absolute -left-[3px] top-0 h-2 w-2 rounded-full bg-brand" />
        </div>
      </button>
      <div className="mt-1.5 flex justify-between text-[11px] text-dim tnum">
        <span>00h</span>
        <span>06h</span>
        <span>12h</span>
        <span>18h</span>
        <span>24h</span>
      </div>
    </>
  );
}
