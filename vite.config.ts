import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      "/healthz": "http://localhost:30000",
      "/readyz": "http://localhost:30000",
      "/api": "http://localhost:30000",
      "/assets": "http://localhost:30000",
      "/ws": { target: "ws://localhost:30000", ws: true },
    },
  },
  build: {
    target: "es2022",
    outDir: "dist",
  },
});
