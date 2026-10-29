import { defineConfig } from "vite";

export default defineConfig({
  envDir: false,
  server: {
    watch: {
      usePolling: true,
    },
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/staff-api": {
        target: "http://127.0.0.1:3001",
        rewrite: (path) => path.replace(/^\/staff-api/, ""),
      },
    },
  },
});
