import { defineConfig, type Plugin } from "vite";
import path from "path";

const isItch = process.env.VITE_ITCH === "1";

// Strips crossorigin attrs + modulepreload links (CORS issues on itch CDN).
// When building for itch (IIFE format), also removes type="module" from script tags.
function itchHtmlFixes(): Plugin {
  return {
    name: "itch-html-fixes",
    transformIndexHtml(html) {
      let out = html
        .replace(/<script([^>]*)\scrossorigin([^>]*)>/g, "<script$1$2>")
        .replace(/<link([^>]*)\scrossorigin([^>]*)\/?>/g, (m, a, b) => {
          if (m.includes("modulepreload")) return "";
          return `<link${a}${b}>`;
        });
      if (isItch) {
        out = out.replace(/<script type="module"/g, "<script defer");
      }
      return out;
    },
  };
}

// Replaces import.meta.url (only valid in ES modules) with a script-tag-safe
// equivalent so the bundle can load as a plain <script> (IIFE) on itch.io.
function replaceImportMeta(): Plugin {
  return {
    name: "replace-import-meta",
    renderChunk(code) {
      if (!code.includes("import.meta.url")) return null;
      return code.replace(
        /import\.meta\.url/g,
        '(document.currentScript&&document.currentScript.src||self.location.href)'
      );
    },
  };
}

// Build is hardened: no source maps, console/debugger stripped, asset hashing,
// terser mangle. The whole bundle is still client-readable — anti-cheat for
// browser games is best-effort by definition.
export default defineConfig(({ mode }) => {
  const isProd = mode === "production";
  const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];
  const autoPagesBase = repoName ? `/${repoName}/` : "/";
  const base = isProd
    ? process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS === "true" ? autoPagesBase : "./")
    : "/";

  return {
    base,
    plugins: isProd ? [itchHtmlFixes(), ...(isItch ? [replaceImportMeta()] : [])] : [],
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
      modulePreload: { polyfill: false },
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
          // itch.io: single IIFE bundle — avoids ES module MIME type issues
          // and cross-origin chunk imports on itch's CDN.
          ...(isItch
            ? {
                format: "iife" as const,
                inlineDynamicImports: true,
                manualChunks: undefined,
              }
            : {
                manualChunks: { phaser: ["phaser"] },
              }),
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
