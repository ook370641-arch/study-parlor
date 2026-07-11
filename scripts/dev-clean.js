const path = require('node:path')
const fs = require('node:fs')
const { forceCleanupDevEnvironment } = require('./lib/process-cleanup')

const PROJECT_ROOT = process.cwd()
const DEV_SERVER_PORT = 5173
const DEVTOOLS_PORT = 9222
const DEV_CACHE_DIR = path.join(PROJECT_ROOT, 'node_modules', '.electron-cache')

/**
 * 清理过期的 dev cache 目录。
 * - 当前路径：node_modules/.electron-cache（Vite 默认排除）
 * - 旧路径：项目根 .electron-cache（已被 app-paths.ts 迁移废弃，但可能残留）
 */
function cleanDevCacheDirs() {
  const dirs = [
    DEV_CACHE_DIR,
    path.join(PROJECT_ROOT, '.electron-cache'),
  ]
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue
    try {
      fs.rmSync(dir, { recursive: true, force: true })
      console.log(`[dev:clean] removed cache dir: ${dir}`)
    } catch (err) {
      console.warn(`[dev:clean] failed to remove ${dir}:`, err.message)
    }
  }
}

async function main() {
  console.log('[dev:clean] aggressive cleanup started')
  console.log('[dev:clean] this will kill all project node/electron processes and wipe the dev cache')

  // Exclude this script and its parent (usually npm/cli) from being killed.
  const currentPids = [process.pid, process.ppid].filter(Boolean)

  const { killed, failed } = await forceCleanupDevEnvironment(PROJECT_ROOT, {
    ports: [DEV_SERVER_PORT, DEVTOOLS_PORT],
    cacheDir: DEV_CACHE_DIR,
    currentPids,
  })

  // 清理缓存目录（包括旧路径迁移残留）
  cleanDevCacheDirs()

  if (killed.length === 0 && failed.length === 0) {
    console.log('[dev:clean] no project processes found; environment is already clean')
  }

  if (failed.length > 0) {
    console.warn('[dev:clean] some processes could not be killed.')
    console.warn('[dev:clean] if the next npm run dev is still slow, try:')
    console.warn('  taskkill /F /IM electron.exe /T')
    console.warn('  taskkill /F /IM node.exe /T')
    console.warn('  rm -rf node_modules/.electron-cache')
    process.exitCode = 1
  } else {
    console.log('[dev:clean] cleanup complete; you can now run npm run dev')
  }
}

main().catch((err) => {
  console.error('[dev:clean] failed:', err)
  process.exit(1)
})
