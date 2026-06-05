import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    setupFiles: ['tests/setup.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
      '@shared': path.resolve(__dirname, 'src/types')
    }
  },
  plugins: [
    {
      name: 'mock-static-assets',
      enforce: 'pre',
      resolveId(id) {
        if (/\.(png|jpe?g|gif|svg|webp)$/i.test(id)) {
          return id
        }
      },
      load(id) {
        if (/\.(png|jpe?g|gif|svg|webp)$/i.test(id)) {
          return 'export default "' + id + '"'
        }
      }
    }
  ]
})
