import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { circleDevServer } from './circleDevServer'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Passing an empty prefix loads the server-only CIRCLE_API_KEY too. Only the
  // VITE_* subset is exposed to browser code by Vite.
  const env = loadEnv(mode, process.cwd(), '')
  const circleEnvironment =
    env.VITE_CIRCLE_ENVIRONMENT === 'live' ? 'live' : 'sandbox'

  return {
    // OAuth redirect URIs must match exactly. Fail instead of silently moving
    // to 5174 when 5173 is occupied.
    server: {
      port: 5173,
      strictPort: true
    },
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
    plugins: [
      // Circle's Web SDK depends on Node-oriented jsonwebtoken/jws modules.
      // Its own Vite example uses these browser polyfills for stream, crypto,
      // process, Buffer, and the other Node primitives those modules import.
      nodePolyfills(),
      react(),
      circleDevServer({
        apiKey: env.CIRCLE_API_KEY,
        environment: circleEnvironment,
        configuredEnvironment: env.VITE_CIRCLE_ENVIRONMENT
      })
    ]
  }
})
