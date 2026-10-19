/**
 * XMLTV (EPG) gerado da grade semanal — alimenta guias de Live TV (Jellyfin etc.).
 * Semântica de horário IDÊNTICA à do playout (currentBlock): hora LOCAL do
 * servidor, blocos NÃO cruzam meia-noite; bloco com end <= start nunca vai pro
 * ar (currentBlock nunca casa com ele) e é ignorado aqui também. Janelas sem
 * bloco viram "Programação automática" para a guia não ficar com buracos.
 */

export interface EpgBlock {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  program: { name: string; genre?: { name: string } | null } | null;
}

export interface EpgOptions {
  channel: { id: string; name: string };
  blocks: EpgBlock[];
  now?: Date;
  daysBack?: number; // default 1
  daysForward?: number; // default 3
  autoLabel?: string; // default "Programação automática"
}

interface Programme {
  start: Date;
  stop: Date;
  title: string;
  category: string | null;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Carimbo XMLTV: "YYYYMMDDHHMMSS +/-HHMM" com o offset local DAQUELE instante. */
export function xmltvStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const off = -d.getTimezoneOffset(); // +180 em -03:00
  const sign = off < 0 ? "-" : "+";
  const a = Math.abs(off);
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` +
    ` ${sign}${p(Math.floor(a / 60))}${p(a % 60)}`
  );
}

function toMin(hhmm: string): number {
  const [h, m] = String(hhmm).split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function epgXmltv(opts: EpgOptions): string {
  const now = opts.now ?? new Date();
  const daysBack = opts.daysBack ?? 1;
  const daysForward = opts.daysForward ?? 3;
  const autoLabel = opts.autoLabel ?? "Programação automática";

  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysBack, 0, 0, 0, 0);
  const windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysForward + 1, 0, 0, 0, 0);

  // blocos da grade → programas absolutos na janela
  const progs: Programme[] = [];
  for (const day = new Date(windowStart); day < windowEnd; day.setDate(day.getDate() + 1)) {
    for (const b of opts.blocks) {
      if (b.dayOfWeek !== day.getDay()) continue;
      const s = toMin(b.startTime);
      const e = toMin(b.endTime);
      if (e <= s) continue; // inválido: nunca vai pro ar (paridade com currentBlock)
      progs.push({
        start: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, s),
        stop: new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, e),
        title: b.program?.name ?? autoLabel,
        category: b.program?.genre?.name ?? null,
      });
    }
  }
  progs.sort((a, b) => a.start.getTime() - b.start.getTime());

  // buracos (janela sem bloco) → programação automática, sem overlap,
  // fatiada à meia-noite local (a guia não deve exibir entradas de vários dias)
  const filled: Programme[] = [];
  const pushAuto = (from: number, to: number): void => {
    let cur = from;
    while (cur < to) {
      const d = new Date(cur);
      const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0).getTime();
      const stop = Math.min(midnight, to);
      filled.push({ start: new Date(cur), stop: new Date(stop), title: autoLabel, category: null });
      cur = stop;
    }
  };
  let cursor = windowStart.getTime();
  for (const p of progs) {
    if (p.stop.getTime() <= cursor) continue; // já coberto por bloco anterior
    if (p.start.getTime() > cursor) pushAuto(cursor, p.start.getTime());
    filled.push({ ...p, start: new Date(Math.max(cursor, p.start.getTime())) });
    cursor = Math.max(cursor, p.stop.getTime());
  }
  if (cursor < windowEnd.getTime()) pushAuto(cursor, windowEnd.getTime());

  const chId = xmlEscape(opts.channel.id);
  const lines: string[] = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<tv generator-info-name="Antenna">`,
    `  <channel id="${chId}">`,
    `    <display-name>${xmlEscape(opts.channel.name)}</display-name>`,
    `  </channel>`,
  ];
  for (const p of filled) {
    lines.push(
      `  <programme start="${xmltvStamp(p.start)}" stop="${xmltvStamp(p.stop)}" channel="${chId}">`,
      `    <title>${xmlEscape(p.title)}</title>`,
      ...(p.category ? [`    <category>${xmlEscape(p.category)}</category>`] : []),
      `  </programme>`
    );
  }
  lines.push(`</tv>`);
  return lines.join("\n") + "\n";
}
