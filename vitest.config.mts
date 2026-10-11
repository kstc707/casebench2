import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts"],
    // Self-hosted Pyodide (apps/web/public/pyodide) is loaded by Node as-is, not transformed by Vite.
    server: { deps: { external: [/apps\/web\/public\/pyodide\//] } },
  },
});
