/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Plan Architecte 2D/3D',
        short_name: 'Plan Archi',
        description:
          "Génération automatique d'un plan d'architecte 2D et d'une maquette 3D à partir de mesures.",
        lang: 'fr',
        theme_color: '#1e293b',
        background_color: '#f8fafc',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'three'
          if (id.includes('jspdf') || id.includes('svg2pdf')) return 'pdf'
          return undefined
        },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
