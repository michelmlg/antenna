/** Antenna — tema (tokens únicos; nada de hex espalhado no código). */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#171717", // fundo geral
        surface: "#292929", // cards, sidebar, modais
        signal: "#FFB547", // sinal — acento: AO VIVO, CTAs, seleção
        foreground: "#FAFAF5", // texto principal
        muted: "#A3A3A3", // texto secundário, bordas sutis
        danger: "#EF4444", // erros, conflitos, ações destrutivas
      },
    },
  },
  plugins: [],
};
