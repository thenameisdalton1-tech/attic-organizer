import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/attic-organizer/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Attic Organizer',
        short_name: 'Attic Organizer',
        description: 'Know exactly what is inside every box.',
        theme_color: '#111111',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/attic-organizer/',
        scope: '/attic-organizer/',
        icons: [
          {
            src: '/attic-organizer/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/attic-organizer/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
})