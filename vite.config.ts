import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import process from "node:process";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "assets/neo/muzi-app-icon-v1.png"],
      manifest: {
        name: "袜厂进销存ERP管理系统",
        short_name: "袜厂ERP",
        description: "袜厂进销存ERP管理系统 - 翻袜、缝头、定型、仓库、采购、支出一体化管理",
        theme_color: "#1a1a2e",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        lang: "zh-CN",
        icons: [
          {
            src: "/assets/neo/muzi-app-icon-v1.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          {
            src: "/assets/neo/muzi-app-icon-v1.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/assets/neo/muzi-app-icon-v1.png",
            sizes: "144x144",
            type: "image/png",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,webp,woff,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https?:\/\/.*\.(?:png|jpg|jpeg|svg|webp|gif)$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "image-cache",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    port: 3000,
    proxy: {
      "/api": `http://127.0.0.1:${process.env.MUZI_PORT ?? "4317"}`,
    },
  },
  build: {
    outDir: "dist",
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
