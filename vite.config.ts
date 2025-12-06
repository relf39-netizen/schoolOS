import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true // Ensure server is accessible externally
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true
    }
  }
})