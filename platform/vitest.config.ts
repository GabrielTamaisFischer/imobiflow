import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    globals: false,
    include: ["src/**/*.test.ts", "backend/**/*.test.ts"],
  },
});
