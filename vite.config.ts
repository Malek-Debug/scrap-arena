import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@ai": path.resolve(__dirname, "src/ai"),
      "@input": path.resolve(__dirname, "src/input"),
      "@rendering": path.resolve(__dirname, "src/rendering"),
      "@scenes": path.resolve(__dirname, "src/scenes"),
    },
  },
  build: {
    target: "es2022",
    minify: "esbuild",
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ["phaser"],
        },
      },
    },
    chunkSizeWarningLimit: 1500,
  },
  server: {
    open: true,
  },
});
