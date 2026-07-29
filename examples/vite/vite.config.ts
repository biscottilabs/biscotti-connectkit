import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    target: 'es2020',
    rollupOptions: {
      onwarn(warning, warn) {
        // React libraries ship "use client" directives for RSC. They carry no
        // meaning in a client-only Vite bundle, and Rollup warns once per file.
        if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return
        warn(warning)
      }
    }
  },
  plugins: [react()]
})
