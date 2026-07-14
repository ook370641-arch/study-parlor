import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'
import path from 'node:path'
import { createRequire } from 'node:module'
// createRequire: this config is ESM; the plugin is CJS. Static `import` would inline the
// module and break its internal `require('node:fs')` calls under esbuild's ESM bundling.
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
    server: {
      watch: {
        ignored: [
          '**/e2e/.test-library/**',
          '**/e2e/.test-config/**',
          '**/e2e-results/**',
          '**/playwright-report/**',
          '**/test-results/**',
          '**/coverage/**',
          // 防御性排除：当 .electron-cache 因旧代码/手动操作落在项目根时，
          // 避免 Vite 监控其中的 Chromium 锁文件（Code Cache/temp-index）。
          // 正常路径在 node_modules/ 下，已被 Vite 默认排除。
          '**/.electron-cache/**',
        ],
      },
      // 预转换入口模块图：dev server 启动后立即并行转换 main.tsx
      // 及其全部 eager import 依赖链。避免浏览器串行请求→发现→再请求
      // 的级联延迟。Windows 上 esbuild 管线慢 3-5×，预转换收益尤为明显。
      warmup: {
        clientFiles: ['./src/main.tsx'],
      },
    },
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
