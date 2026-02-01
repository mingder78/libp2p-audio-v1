import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1500, // size in KB (default is 500)
  },
  resolve: {
    alias: {
      "@": "/src", // ← very common & clean
      // or more granular:
      // '@components': '/src/components',
    },
  },
});
