import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // padrões: dev local (api :3001, mediamtx :8080); override p/ revisar com
      // os containers (tudo sai pelo nginx :3000)
      "/api": process.env.VITE_PROXY_API ?? "http://localhost:3001",
      "/hls": process.env.VITE_PROXY_HLS ?? "http://localhost:8080",
    },
  },
});
