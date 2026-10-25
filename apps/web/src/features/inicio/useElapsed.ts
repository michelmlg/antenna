import { useEffect, useState } from "react";

/**
 * Relógio local de 1s — sem isto o tempo congela: o payload do playout não muda
 * enquanto o mesmo item toca (structural sharing no TanStack Query), então o
 * componente só repintaria na troca de item. O cálculo é de relógio de parede,
 * igual ao do worker (playout.ts — fim do item por elapsed >= duration).
 * O primeiro tick é ancorado na virada do segundo para o contador não atrasar.
 */
export function useElapsed(startedAt: string | undefined, duration: number) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const read = () => setNow(Date.now());
    read(); // troca de item: não espera o próximo tick para zerar a barra
    let timer = window.setTimeout(
      () => {
        read();
        timer = window.setInterval(read, 1000);
      },
      1000 - (Date.now() % 1000),
    );
    // aba em background throttliza o interval (~1/min) → repinta ao voltar ao foco
    const onVisible = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [startedAt]);

  const known = duration > 0 && !!startedAt;
  const total = startedAt
    ? Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000))
    : 0;
  // o worker só encerra no tick seguinte (até 5s + cooldown) → trava em 100% até trocar
  const elapsed = known ? Math.min(total, duration) : total;
  const pct = known ? Math.min(100, (elapsed / duration) * 100) : 0;
  const remaining = known ? Math.max(0, duration - elapsed) : null;
  return { known, elapsed, pct, remaining };
}
