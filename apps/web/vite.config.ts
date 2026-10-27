import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  // portas vêm do .env central da raiz (sem prefixo VITE_: só o config lê)
  const env = { ...loadEnv(mode, path.resolve(__dirname, "../.."), ""), ...process.env };
  return {
    plugins: [react()],
    server: {
      port: Number(env.WEB_DEV_PORT) || 5173,
      proxy: {
        // padrões: dev local (api :API_PORT, mediamtx :HLS_PORT); override p/ revisar
        // com os containers (tudo sai pelo nginx :WEB_PORT)
        "/api": env.VITE_PROXY_API ?? `http://localhost:${env.API_PORT || 3001}`,
        "/hls": env.VITE_PROXY_HLS ?? `http://localhost:${env.HLS_PORT || 8080}`,
      },
    },
  };
});
