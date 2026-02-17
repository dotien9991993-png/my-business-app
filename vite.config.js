import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy Zalo OAuth API (tránh CORS khi refresh token)
      '/zalo-oauth': {
        target: 'https://oauth.zaloapp.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zalo-oauth/, ''),
      },
      // Proxy Zalo OA API (tránh CORS khi gọi API)
      '/zalo-api': {
        target: 'https://openapi.zalo.me',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zalo-api/, ''),
      },
    },
  },
})
