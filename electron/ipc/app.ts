import { ipcMain, shell } from 'electron'

export function registerAppIpc() {
  ipcMain.handle('app:openExternal', async (_event, url: string) => {
    if (typeof url !== 'string' || !url.trim()) {
      throw new Error('Invalid URL')
    }
    await shell.openExternal(url.trim())
  })
}
