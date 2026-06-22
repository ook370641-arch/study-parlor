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
    },
    {
      name: 'mock-electron',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'electron') {
          return '\0mock-electron'
        }
      },
      load(id) {
        if (id === '\0mock-electron') {
          return `
            export const safeStorage = {
              isEncryptionAvailable: () => true,
              encryptString: (s) => Buffer.from('enc:' + s),
              decryptString: (b) => {
                const str = b.toString()
                if (!str.startsWith('enc:')) throw new Error('Invalid encrypted data')
                return str.replace(/^enc:/, '')
              }
            }
            export const ipcMain = {
              handle: () => {}
            }
          `
        }
      }
    }
  ]
})
