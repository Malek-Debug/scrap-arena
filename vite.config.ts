import { defineConfig } from "vite";
import path from "path";

// Build is hardened: no source maps, console/debugger stripped, asset hashing,
// terser mangle. The whole bundle is still client-readable — anti-cheat for
// browser games is best-effort by definition.
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const autoPagesBase = repoName ? `/${repoName}/` : "/";
  const base = isProd
    ? process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS === "true" ? autoPagesBase : "/")
    : "/";

  return {
    base,
    resolve: {
      alias: {
        "@core": path.resolve(__dirname, "src/core"),
        "@ai": path.resolve(__dirname, "src/ai"),
        "@input": path.resolve(__dirname, "src/input"),
        "@rendering": path.resolve(__dirname, "src/rendering"),
        "@scenes": path.resolve(__dirname, "src/scenes"),
      },
    },
    esbuild: isProd
      ? {
          drop: ["console", "debugger"],
          legalComments: "none",
        }
      : undefined,
    build: {
      target: "es2022",
      minify: "terser",
      sourcemap: false,
      cssCodeSplit: true,
      assetsInlineLimit: 4096,
      reportCompressedSize: false,
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          passes: 2,
          pure_funcs: ["console.log", "console.info", "console.debug"],
        },
        mangle: {
          // Keep the YT Playables SDK surface untouched — it's referenced by name.
          reserved: ["ytgame", "ethereum"],
        },
        format: { comments: false },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            phaser: ["phaser"],
            ethers: ["ethers"],
          },
          entryFileNames: "assets/[hash].js",
          chunkFileNames: "assets/[hash].js",
          assetFileNames: "assets/[hash][extname]",
        },
      },
      chunkSizeWarningLimit: 1500,
    },
    server: {
      open: true,
    },
  };
});
