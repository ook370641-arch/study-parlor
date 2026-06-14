import { ipcMain } from 'electron'
import { loadEnv, saveEnv } from '../env'
import type { AppConfig } from '../env'

export function registerConfigIpc() {
  ipcMain.handle('config:get', async (): Promise<AppConfig> => {
    return loadEnv(process.env)
  })

  ipcMain.handle('config:write', async (_, config: AppConfig): Promise<void> => {
    saveEnv(config)
  })
}
