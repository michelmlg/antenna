/** Endereço somente-leitura com botão de copiar (feedback no ícone + toast). */
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "../lib/clipboard";
import { IconButton, useToast, cn } from "./ui";

export function CopyField({
  value,
  label,
  className,
}: {
  value: string;
  /** prefixo curto (ex.: "M3U") */
  label?: string;
  className?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg bg-raised py-1 pl-3 pr-1 transition-colors hover:bg-element/60",
        className,
      )}
    >
      {label && <span className="shrink-0 text-xs text-dim">{label}</span>}
      <span className="min-w-0 flex-1 truncate font-mono text-xs text-sub" title={value}>
        {value}
      </span>
      <IconButton
        icon={copied ? Check : Copy}
        label={copied ? "Copiado" : "Copiar endereço"}
        className={copied ? "text-ok hover:text-ok" : undefined}
        onClick={() => {
          copyText(value)
            .then(() => {
              setCopied(true);
              toast("Endereço copiado");
            })
            .catch(() => toast("Não deu para copiar", { tone: "error" }));
        }}
      />
    </div>
  );
}
