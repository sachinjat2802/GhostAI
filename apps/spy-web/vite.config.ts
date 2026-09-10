import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/spy/',
  build: {
    outDir: path.resolve(__dirname, '../core-engine/public/spy'),
    emptyOutDir: true,
  },
})
