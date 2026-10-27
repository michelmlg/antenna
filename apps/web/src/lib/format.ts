/** Formatação de tempo/data usada em todo o painel (pt-BR). */

/** Segundos → "m:ss" ou "h:mm:ss"; 0/desconhecido → "—". */
export function fmtDur(s: number): string {
  if (!s) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
}

/** ISO → "dd/mm, hh:mm". */
export function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** ISO ou Date → "hh:mm". */
export function hhmm(at: string | Date): string {
  return new Date(at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Horas com vírgula ("7,5 h") a partir de minutos. */
export function fmtHours(min: number): string {
  const h = Math.round((min / 60) * 10) / 10;
  return `${String(h).replace(".", ",")} h`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
