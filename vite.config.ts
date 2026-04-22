import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Avoid browser CORS: JSON API does not send Access-Control-Allow-Origin.
const wikiProxy = {
  '/api/wiki': {
    target: 'https://thedigitalodyssey.com',
    changeOrigin: true,
    secure: true,
  },
} as const

// https://vite.dev/config/
export default defineConfig({
  // For GitHub Pages project sites, set VITE_BASE_PATH="/<repo-name>/"
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  server: {
    proxy: wikiProxy,
  },
  preview: {
    proxy: wikiProxy,
  },
})
