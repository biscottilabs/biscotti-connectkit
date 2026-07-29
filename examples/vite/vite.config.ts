import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Dependency pre-bundling does not inherit `build.target`. Vite's default
  // includes Safari 13, which predates BigInt literals, so esbuild refuses to
  // pre-bundle viem's `123n` literals and `vite dev` fails while `vite build`
  // succeeds. Pin the same target here so dev and build agree.
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2020'
    }
  },
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
