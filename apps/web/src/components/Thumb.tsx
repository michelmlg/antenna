/** Miniatura de vídeo com fallback (thumb quebrada ou ausente vira um bloco neutro). */
import { useState } from "react";
import { cn } from "./ui";

export function thumbOf(m: {
  thumbnailUrl: string | null;
  resolvedId?: string | null;
}): string | null {
  if (m.thumbnailUrl) return m.thumbnailUrl;
  if (m.resolvedId) return `https://i.ytimg.com/vi/${m.resolvedId}/mqdefault.jpg`;
  return null;
}

export function Thumb({
  src,
  fallback,
  className,
}: {
  src: string | null;
  fallback?: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (!src || broken)
    return (
      <div
        className={cn("flex items-center justify-center bg-raised text-[10px] text-dim", className)}
      >
        {fallback}
      </div>
    );
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn("object-cover", className)}
    />
  );
}
