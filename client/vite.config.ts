import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const useHttps = process.env.HTTPS === "1";

const plugins: PluginOption[] = [react()];
if (useHttps) plugins.push(basicSsl());

export default defineConfig({
  plugins,
  server: {
    port: 5173,
    host: true,
    https: useHttps ? {} : undefined,
  },
  preview: {
    port: 4173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: [
            "@react-three/fiber",
            "@react-three/drei",
            "@react-three/postprocessing",
          ],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
