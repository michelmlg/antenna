/** Antenna — tema (tokens únicos; nada de hex espalhado no código). */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '"Inter Variable"',
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
      colors: {
        // superfícies (profundidade por camada, não por borda forte)
        base: "#0F141B", // fundo do app
        panel: "#151B24", // sidebar, cards, modais
        raised: "#1C2430", // campos, hover, itens dentro de cards
        line: "#263040", // bordas e divisórias
        element: "#374151", // controles neutros (trilho do switch, segmento ativo)
        // texto
        fg: "#E5E7EB", // texto principal
        sub: "#9CA3AF", // texto secundário
        dim: "#6B7280", // metadados, dicas
        // marca e semânticas
        brand: { DEFAULT: "#FFC83D", ink: "#1A1405" }, // ação primária, seleção, foco
        live: "#F05252", // AO VIVO (luz de estúdio)
        danger: "#F05252", // erros e ações destrutivas
        ok: "#34D399", // saúde/sucesso
      },
      boxShadow: {
        pop: "0 16px 40px -12px rgba(0,0,0,0.6)",
        "brand-glow": "0 8px 22px -8px rgba(255,200,61,0.55)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "pop-in": {
          from: { opacity: "0", transform: "translateY(6px) scale(0.98)" },
          to: { opacity: "1", transform: "none" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        blink: { "0%,100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-3px)" },
          "75%": { transform: "translateX(3px)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "pop-in": "pop-in 180ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        "slide-up": "slide-up 220ms cubic-bezier(0.2, 0.9, 0.3, 1)",
        blink: "blink 1.8s ease-in-out infinite",
        shake: "shake 0.18s ease-in-out 2",
      },
    },
  },
  plugins: [],
};
