import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
    nitro(),
  ],
  resolve: {
    alias:
      command === "build"
        ? {
            // See vite-shims/jsx-dev-runtime-prod-shim.mjs: works around a build bug
            // where some server chunks call the dev JSX runtime in production builds.
            "react/jsx-dev-runtime": fileURLToPath(
              new URL("./vite-shims/jsx-dev-runtime-prod-shim.mjs", import.meta.url),
            ),
          }
        : undefined,
  },
}));
