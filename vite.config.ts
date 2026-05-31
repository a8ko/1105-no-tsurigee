import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "./",
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      input: {
        // 既存の釣りゲームと、歩行キャラ・サンドボックスの2ページをビルドする。
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        sandbox: fileURLToPath(new URL("./sandbox.html", import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    open: false,
  },
});
