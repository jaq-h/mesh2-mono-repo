import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Path aliases
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development
  // Prevent vite from obscuring rust errors
  clearScreen: false,

  // Development server configuration
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    // Tauri expects a fixed port, fail if that port is not available
    watch: {
      // Tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },

  // Preview server
  preview: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },

  // Build configuration
  build: {
    outDir: "dist",
    // Tauri uses Chromium on Windows and WebKit on macOS and Linux
    target:
      process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari14",
    // Don't minify for debug builds
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    // Produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          tauri: ["@tauri-apps/api"],
        },
      },
    },
  },

  // Environment variable prefix
  envPrefix: ["VITE_", "TAURI_ENV_"],

  // Optimize dependencies
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "@tauri-apps/api"],
  },
});
