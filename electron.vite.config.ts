import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'
import { createLogger, type Logger } from 'vite'
import path from 'node:path'
import { createRequire } from 'node:module'
// createRequire: this config is ESM; the plugin is CJS. Static `import` would inline the
// module and break its internal `require('node:fs')` calls under esbuild's ESM bundling.
const paintingsPlugin = createRequire(import.meta.url)('./scripts/vite-paintings-plugin.cjs')

// The key signals of startup trouble ("new dependencies optimized",
// "Re-optimizing") used to flash by as ordinary log lines. Wrap the logger so
// those messages come with remediation guidance attached, letting the next
// investigation start from the conclusion. English/ASCII only — see
// startup-watchdog.ts for why. See the startup tracking doc, Task 11.
function createWatchdogLogger(): Logger {
  const logger = createLogger()
  const info = logger.info.bind(logger)
  logger.info = (msg, opts) => {
    info(msg, opts)
    if (msg.includes('new dependencies optimized')) {
      logger.warn(
        '[startup-watchdog] new dependency discovered mid-session. If a full page reload follows ' +
        '(brown flash + loading screen twice), add the dependency to optimizeDeps.include ' +
        'in electron.vite.config.ts (rules build-dev §10)'
      )
    } else if (msg.includes('Re-optimizing dependencies')) {
      logger.warn(
        '[startup-watchdog] deps cache invalidated and rebuilt (one-time cost). If this appears on ' +
        'every startup, check whether node_modules/.vite is being deleted by a cleanup script'
      )
    }
  }
  return logger
}

export default defineConfig(({ command }) => ({
  main: {
    // dev 模式下把 node_modules 依赖（gray-matter/turndown/dotenv）外部化，
    // 主进程 SSR 构建从 ~15s 降到 ~1s。打包构建（command === 'build'）保持
    // 全量内联 —— asar 内资源解析已按现状验证，不动。
    plugins: command === 'serve' ? [externalizeDepsPlugin()] : [],
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
    customLogger: createWatchdogLogger(),
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
      // 7 个懒加载页面入口也一并预热——否则首屏 Cover chunk 要冷转换 ~12s。
      warmup: {
        clientFiles: [
          './src/main.tsx',
          './src/pages/Cover.tsx',
          './src/pages/Home.tsx',
          './src/pages/Study.tsx',
          './src/pages/Profile.tsx',
          './src/pages/Extension.tsx',
          './src/pages/Settings.tsx',
          './src/pages/Briefing.tsx',
        ],
      },
    },
    // 懒加载页面（React.lazy）独有的裸依赖不在 index.html 初始扫描路径上。
    // 运行时才被发现（如 ArticleAnnotations 的 `react-dom`）会触发
    // "new dependencies optimized" → 整页 reload，表现为加载动画结束后
    // 棕色闪屏 + 二次加载。显式 include 在 server 启动时一次打包，彻底杜绝。
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'zustand',
        'react-markdown',
        'remark-gfm',
        'unified',
        'unist-util-visit',
        '@milkdown/core',
        '@milkdown/ctx',
        '@milkdown/react',
        '@milkdown/preset-commonmark',
        '@milkdown/preset-gfm',
        '@milkdown/plugin-listener',
        '@milkdown/plugin-history',
        '@milkdown/plugin-clipboard',
        '@milkdown/utils',
        '@milkdown/prose/state',
        '@milkdown/prose/keymap',
      ],
      // 让启动扫描覆盖懒加载页面入口，未来新增的页面级裸依赖也能在
      // 启动时被发现，而不是运行时触发 re-optimization。
      entries: ['index.html', 'src/pages/**/*.tsx'],
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
}))
