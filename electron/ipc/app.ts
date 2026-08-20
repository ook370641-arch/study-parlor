import { ipcMain, shell } from 'electron'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export function registerAppIpc() {
  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('Invalid URL')
    }
    await shell.openExternal(url.trim())
  })

  // 写作笔记里的 file:// 链接(如 hermes 日报指向库外的 HTML):fileURLToPath
  // 负责百分号解码(中文路径),文件不存在时抛 FILE_NOT_FOUND 由渲染层记日志。
  ipcMain.handle('app:openLocalFile', async (_event, url: string) => {
    if (typeof url !== 'string' || !/^file:\/\//i.test(url.trim())) {
      throw new Error('Invalid file URL')
    }
    const abs = fileURLToPath(url.trim())
    if (!fs.existsSync(abs)) {
      throw Object.assign(new Error(`文件不存在: ${abs}`), { code: 'FILE_NOT_FOUND' })
    }
    const err = await shell.openPath(abs)
    if (err) throw new Error(err)
  })
}
