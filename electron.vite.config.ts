import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { createRequire } from 'node:module'
const paintingsPlugin = createRequire(import.meta.url)('./scripts/vite-paintings-plugin.cjs')

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/main.ts'),
        output: { entryFileNames: 'index.js' },
        external: ['electron']
      },
      outDir: 'out/main'
    }
  },
  preload: {
    build: {
      rollupOptions: {
        input: path.resolve(__dirname, 'electron/preload.ts'),
        output: { entryFileNames: 'index.js' }
      },
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: '.',
    build: {
      rollupOptions: { input: 'index.html' },
      outDir: 'out/renderer'
    },
    plugins: [react(), paintingsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@shared': path.resolve(__dirname, 'src/types'),
        '@electron': path.resolve(__dirname, 'electron')
      }
    }
  }
})
