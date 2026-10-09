import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // GitHub Pages serves the app under /Rental-Tycoon/; the deploy workflow sets BASE_PATH.
  base: process.env.BASE_PATH ?? "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon-64x64.png", "apple-touch-icon.png"],
      manifest: {
        name: "Rental Tycoon",
        short_name: "Rental Tycoon",
        description: "Gère ton agence de location de voitures.",
        lang: "fr",
        display: "standalone",
        orientation: "portrait",
        background_color: "#2b2d42",
        theme_color: "#2b2d42",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
        // 3D models (Kenney kits): cached on first use rather than precached, since most are unused.
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.+\.glb$/,
            handler: "CacheFirst",
            options: { cacheName: "models", expiration: { maxEntries: 400 } },
          },
          {
            // Audio: rangeRequests so iOS Safari can seek/loop cached files.
            urlPattern: /\/assets\/audio\/.+\.mp3$/,
            handler: "CacheFirst",
            options: {
              cacheName: "audio",
              expiration: { maxEntries: 20 },
              rangeRequests: true,
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: { port: 5173, proxy: { "/api": "http://127.0.0.1:3001" } },
  test: { name: "web", environment: "jsdom" },
});
