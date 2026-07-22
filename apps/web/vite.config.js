import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  esbuild: {
    jsx: 'automatic'
  },
  resolve: {
    alias: {
      '@iconoir': fileURLToPath(new URL('./node_modules/iconoir-react/dist/esm/regular', import.meta.url)),
      '@iconoir-solid': fileURLToPath(new URL('./node_modules/iconoir-react/dist/esm/solid', import.meta.url))
    }
  },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        if (
          warning.code === 'MODULE_LEVEL_DIRECTIVE' &&
          warning.message.includes('"use client"') &&
          warning.id?.includes('iconoir-react')
        ) {
          return
        }
        warn(warning)
      }
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  preview: {
    host: '127.0.0.1',
    port: 4173
  }
})
