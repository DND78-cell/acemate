import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

// Two builds from one codebase:
//   vite build --mode web       → dist/web, the standalone website (served by server/)
//   vite build --mode artifact  → dist/artifact, one bundle inlined into a claude.ai page
export default defineConfig(({ mode }) => {
  const artifact = mode === "artifact";
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    server: {
      // `npm run dev` talks to the API server from `npm run dev:server`.
      proxy: { "/api": "http://localhost:8787" },
    },
    build: artifact
      ? {
          outDir: "dist/artifact",
          target: "es2022",
          cssCodeSplit: false,
          modulePreload: false,
          assetsInlineLimit: 100_000_000,
          copyPublicDir: false,
          rolldownOptions: { output: { codeSplitting: false } },
        }
      : {
          outDir: "dist/web",
          target: "es2022",
        },
  };
});
