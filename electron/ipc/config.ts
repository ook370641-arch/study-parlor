import { ipcMain } from 'electron'
import { loadEnv, updateEnvKeys } from '../env'
import type { AppConfig } from '../env'
import { getCurrentState, patchState } from './state'
import { createLlmConfigActions, type LlmCreds } from '../lib/llm-configs'

export function registerConfigIpc(cfg: AppConfig) {
  const actions = createLlmConfigActions(cfg, { getState: getCurrentState, patch: patchState })

  ipcMain.handle('config:get', async (): Promise<AppConfig> => {
    return loadEnv(process.env)
  })

  ipcMain.handle('llmConfig:list', async () => actions.list())

  ipcMain.handle('llmConfig:setActive', async (_, id: string) => actions.setActive(id))

  ipcMain.handle('llmConfig:save', async (_, id: string | null, fields: LlmCreds) => actions.save(id, fields))

  ipcMain.handle('config:setLibraryPath', async (_, p: string) => {
    updateEnvKeys({ STUDY_LIBRARY_PATH: p.trim() })
    return { ok: true as const }
  })
}
