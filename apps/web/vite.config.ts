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

  // Development server configuration
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false,
    open: false,
    cors: true,
    // Proxy API requests to backend during development
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
        secure: false,
      },
    },
  },

  // Preview server (for testing production builds locally)
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: false,
  },

  // Build configuration
  build: {
    outDir: "dist",
    sourcemap: true,
    // Optimize chunk splitting
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
        },
      },
    },
  },

  // Environment variable prefix
  envPrefix: "VITE_",

  // Optimize dependencies
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom"],
  },
});
