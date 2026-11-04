/** Hooks utilitários sem dependência de domínio. */
import { useCallback, useEffect, useState, type RefObject } from "react";

/** Relógio de parede que repinta a cada `ms` (ancorado na virada do intervalo). */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const read = () => setNow(new Date());
    let interval: number | undefined;
    const first = window.setTimeout(
      () => {
        read();
        interval = window.setInterval(read, ms);
      },
      ms - (Date.now() % ms),
    );
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [ms]);
  return now;
}

export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatch(e.matches);
    setMatch(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

/**
 * Estado persistido no navegador (preferências locais: gaveta aberta, aba lembrada).
 * Storage indisponível (modo privado) → cai para estado em memória sem erro.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* storage bloqueado: fica só em memória */
        }
        return next;
      });
    },
    [key],
  );
  return [value, set];
}

/** Fecha algo ao clicar fora de `ref` ou apertar Esc (menus, popovers). */
export function useDismiss(
  open: boolean,
  ref: RefObject<HTMLElement>,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, onDismiss]);
}
