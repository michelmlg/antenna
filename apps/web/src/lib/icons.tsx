/** Ícones de gênero (lucide, galeria curada) — única fonte de resolução nome→ícone. */
import {
  Bot, BookOpen, Camera, Car, ChefHat, Clapperboard, Cpu, Drama, Dumbbell, Fish, Gamepad2, Ghost, Globe, Leaf, Mountain, Music, Newspaper, Palette, Plane, Podcast, Puzzle, Rocket, Trophy, Tv,
  type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  clapperboard: Clapperboard,
  "gamepad-2": Gamepad2,
  newspaper: Newspaper,
  fish: Fish,
  mountain: Mountain,
  tv: Tv,
  music: Music,
  camera: Camera,
  "chef-hat": ChefHat,
  car: Car,
  plane: Plane,
  rocket: Rocket,
  cpu: Cpu,
  dumbbell: Dumbbell,
  palette: Palette,
  globe: Globe,
  "book-open": BookOpen,
  podcast: Podcast,
  bot: Bot,
  trophy: Trophy,
  drama: Drama,
  ghost: Ghost,
  puzzle: Puzzle,
  leaf: Leaf,
};

export const ICON_PALETTE = Object.keys(MAP);

export function GenreIcon({ name, size = 16, className = "" }: { name?: string | null; size?: number; className?: string }) {
  const C = MAP[String(name || "").toLowerCase()] || Tv;
  return <C size={size} className={className} />;
}
