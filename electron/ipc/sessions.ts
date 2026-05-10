import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import { saveSession, loadSessions, deleteSession } from '../lib/session-persist'
import type { UnsavedSession } from '@shared/index'

export function registerSessionsIpc(cfg: AppConfig) {
  ipcMain.handle('sessions:load', async () => {
    return loadSessions()
  })

  ipcMain.handle('sessions:save', async (_, session: UnsavedSession) => {
    saveSession(session)
  })

  ipcMain.handle('sessions:delete', async (_, id: string) => {
    deleteSession(id)
  })
}
