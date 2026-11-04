/**
 * Ícones de gênero — galeria fixa (lucide), única fonte de resolução nome→ícone.
 * O nome salvo no gênero (`Genre.icon`) é a chave kebab-case abaixo; nome
 * desconhecido (ex.: emoji legado) cai no ícone de TV.
 */
import {
  Archive,
  Baby,
  Bike,
  Bot,
  BookOpen,
  CakeSlice,
  Camera,
  Car,
  Cat,
  ChefHat,
  Clapperboard,
  Coffee,
  Cpu,
  Dice5,
  Dog,
  Drama,
  Dumbbell,
  Film,
  Fish,
  Flame,
  Flower2,
  Gamepad2,
  Ghost,
  Globe,
  GraduationCap,
  Guitar,
  Headphones,
  Heart,
  History,
  House,
  Joystick,
  Laugh,
  Leaf,
  Lightbulb,
  Mic,
  Moon,
  Mountain,
  Music,
  Newspaper,
  Palette,
  Pizza,
  Plane,
  Podcast,
  Popcorn,
  Puzzle,
  Radio,
  Rocket,
  Sparkles,
  Star,
  Sun,
  Trees,
  Trophy,
  Tv,
  Utensils,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";

interface IconDef {
  name: string;
  Icon: LucideIcon;
  /** termos de busca em pt-BR */
  keywords: string;
}

export const ICON_CATEGORIES: { label: string; icons: IconDef[] }[] = [
  {
    label: "Mídia",
    icons: [
      { name: "tv", Icon: Tv, keywords: "tv televisão canal" },
      { name: "clapperboard", Icon: Clapperboard, keywords: "filme cinema" },
      { name: "film", Icon: Film, keywords: "filme" },
      { name: "video", Icon: Video, keywords: "vlog vídeo câmera" },
      { name: "camera", Icon: Camera, keywords: "foto câmera" },
      { name: "podcast", Icon: Podcast, keywords: "podcast" },
      { name: "mic", Icon: Mic, keywords: "microfone podcast entrevista" },
      { name: "radio", Icon: Radio, keywords: "rádio" },
      { name: "music", Icon: Music, keywords: "música" },
      { name: "guitar", Icon: Guitar, keywords: "guitarra rock música" },
      { name: "headphones", Icon: Headphones, keywords: "fone música" },
      { name: "newspaper", Icon: Newspaper, keywords: "notícias jornal" },
      { name: "laugh", Icon: Laugh, keywords: "react humor comédia risada" },
      { name: "drama", Icon: Drama, keywords: "teatro drama" },
      { name: "popcorn", Icon: Popcorn, keywords: "pipoca filme" },
      { name: "archive", Icon: Archive, keywords: "nostalgia arquivo antigo" },
      { name: "history", Icon: History, keywords: "nostalgia retrô história" },
    ],
  },
  {
    label: "Jogos e esporte",
    icons: [
      { name: "gamepad-2", Icon: Gamepad2, keywords: "jogo game gameplay" },
      { name: "joystick", Icon: Joystick, keywords: "retrô arcade jogo" },
      { name: "puzzle", Icon: Puzzle, keywords: "quebra-cabeça puzzle" },
      { name: "dice-5", Icon: Dice5, keywords: "dado tabuleiro" },
      { name: "trophy", Icon: Trophy, keywords: "troféu campeonato esporte" },
      { name: "dumbbell", Icon: Dumbbell, keywords: "academia treino" },
      { name: "bike", Icon: Bike, keywords: "bike ciclismo" },
      { name: "car", Icon: Car, keywords: "carro corrida automóvel" },
    ],
  },
  {
    label: "Natureza",
    icons: [
      { name: "fish", Icon: Fish, keywords: "peixe aquário aquarismo" },
      { name: "mountain", Icon: Mountain, keywords: "natureza montanha paisagem" },
      { name: "trees", Icon: Trees, keywords: "floresta árvore" },
      { name: "leaf", Icon: Leaf, keywords: "planta folha jardim" },
      { name: "flower-2", Icon: Flower2, keywords: "flor jardim" },
      { name: "dog", Icon: Dog, keywords: "cachorro pet" },
      { name: "cat", Icon: Cat, keywords: "gato pet" },
      { name: "globe", Icon: Globe, keywords: "mundo viagem" },
      { name: "plane", Icon: Plane, keywords: "viagem avião" },
      { name: "sun", Icon: Sun, keywords: "manhã dia sol" },
      { name: "moon", Icon: Moon, keywords: "noite madrugada" },
      { name: "rocket", Icon: Rocket, keywords: "espaço foguete ciência" },
    ],
  },
  {
    label: "Comida",
    icons: [
      { name: "chef-hat", Icon: ChefHat, keywords: "cozinha receita chef" },
      { name: "pizza", Icon: Pizza, keywords: "pizza comida" },
      { name: "coffee", Icon: Coffee, keywords: "café" },
      { name: "cake-slice", Icon: CakeSlice, keywords: "bolo doce confeitaria" },
      { name: "utensils", Icon: Utensils, keywords: "comida restaurante" },
    ],
  },
  {
    label: "Outros",
    icons: [
      { name: "cpu", Icon: Cpu, keywords: "tecnologia hardware" },
      { name: "bot", Icon: Bot, keywords: "robô ia tecnologia" },
      { name: "wrench", Icon: Wrench, keywords: "ferramenta diy conserto" },
      { name: "house", Icon: House, keywords: "casa decoração" },
      { name: "baby", Icon: Baby, keywords: "crianças infantil" },
      { name: "palette", Icon: Palette, keywords: "arte desenho" },
      { name: "book-open", Icon: BookOpen, keywords: "livros estudo" },
      { name: "graduation-cap", Icon: GraduationCap, keywords: "educação aula" },
      { name: "lightbulb", Icon: Lightbulb, keywords: "ideia ciência" },
      { name: "ghost", Icon: Ghost, keywords: "terror halloween" },
      { name: "sparkles", Icon: Sparkles, keywords: "especial destaque" },
      { name: "heart", Icon: Heart, keywords: "favoritos amor" },
      { name: "flame", Icon: Flame, keywords: "em alta" },
      { name: "star", Icon: Star, keywords: "destaque estrela" },
    ],
  },
];

const MAP: Record<string, LucideIcon> = Object.fromEntries(
  ICON_CATEGORIES.flatMap((c) => c.icons.map((i) => [i.name, i.Icon])),
);

export const ICON_PALETTE = Object.keys(MAP);
export const DEFAULT_GENRE_ICON = "tv";

export function GenreIcon({
  name,
  size = 16,
  className = "",
  strokeWidth = 1.9,
}: {
  name?: string | null;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const C = MAP[String(name || "").toLowerCase()] || Tv;
  return <C size={size} className={className} strokeWidth={strokeWidth} aria-hidden />;
}
