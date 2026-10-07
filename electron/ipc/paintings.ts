// 画作裁剪 IPC。dev-only：打包版与 e2e（E2E_CONFIG_DIR）下 canEdit=false，
// 渲染进程据此隐藏入口。setFocus 写 Pictures/index.json（事实源），manifest 由
// vite-paintings-plugin 在 dev 启动 / build 时重新生成，运行时无需处理。
import fs from 'node:fs'
import path from 'node:path'
import { app, ipcMain } from 'electron'
import { applyFocusToIndex } from '../lib/painting-focus'

function resolveIndexPath(): string {
  // 与 electron/ipc/files.ts getExtensionInfo 相同的路径解析
  const base = app.isPackaged ? path.dirname(app.getPath('exe')) : app.getAppPath()
  return path.join(base, 'Pictures', 'index.json')
}

function canEdit(): boolean {
  if (app.isPackaged) return false
  if (process.env.E2E_CONFIG_DIR) return false // e2e 跑未打包构建，防止污染真实画作库
  try {
    fs.accessSync(resolveIndexPath(), fs.constants.W_OK)
    return true
  } catch {
    return false
  }
}

export function registerPaintingsIpc() {
  ipcMain.handle('paintings:canEdit', async () => canEdit())
  ipcMain.handle('paintings:setFocus', async (_event, args: { id: string; focus: string }) =>
    applyFocusToIndex(resolveIndexPath(), args?.id ?? '', args?.focus ?? ''))
}
