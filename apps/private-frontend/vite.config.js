import { defineConfig } from "vite";

const authHandoffPlugin = {
  name: "training2-auth-handoff",
  transformIndexHtml(html) {
    const script = `
      <script>
        (() => {
          const hash = window.location.hash;

          if (!hash.startsWith("#training2-token=")) {
            return;
          }

          const token = decodeURIComponent(
            hash.slice("#training2-token=".length),
          );

          if (token) {
            sessionStorage.setItem("training2.admin", token);
          }

          window.history.replaceState(
            null,
            document.title,
            window.location.pathname + window.location.search,
          );
        })();
      </script>
    `;

    return html.replace("</head>", `${script}</head>`);
  },
};

export default defineConfig({
  envDir: false,
  plugins: [authHandoffPlugin],
  server: {
    watch: {
      usePolling: true,
    },
    host: "0.0.0.0",
    port: 5174,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
