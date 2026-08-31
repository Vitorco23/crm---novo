import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
const APP_BUILD_ID = Date.now().toString(36);

export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mcpPlugin(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  optimizeDeps: {
    // Pré-empacota deps pesadas usadas em rotas lazy (ex.: /comando) para evitar
    // re-otimização no meio da sessão, que invalida os módulos já carregados e
    // causa "Failed to fetch dynamically imported module".
    include: ["react-markdown", "@tanstack/query-core"],
  },
  build: {

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/xlsx/")) return "vendor-xlsx";
          if (id.includes("/recharts/") || id.includes("/d3-")) return "vendor-charts";
          if (id.includes("/react-markdown/") || id.includes("/remark-") || id.includes("/rehype-")) {
            return "vendor-markdown";
          }
          if (id.includes("/@supabase/")) return "vendor-supabase";
        },
      },
    },
  },
}));
