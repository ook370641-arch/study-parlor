import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import {
  addCollectionEntry,
  appendCollectionQA,
  readCollection,
  removeCollectionEntry,
  updateCollectionNote,
} from '../lib/collection-store'
import type { BriefingCollectionEntry, BriefingCollectionQA } from '@shared/index'

export function registerCollectionIpc(cfg: AppConfig) {
  ipcMain.handle('collection:read', async () => readCollection(cfg.libraryPath))

  ipcMain.handle('collection:addEntry', async (_, entry: BriefingCollectionEntry) => {
    try {
      const result = addCollectionEntry(cfg.libraryPath, entry)
      if (result === 'duplicate') return { ok: false as const, code: 'DUPLICATE' as const }
      return { ok: true as const }
    } catch {
      return { ok: false as const, code: 'WRITE_ERROR' as const }
    }
  })

  ipcMain.handle('collection:removeEntry', async (_, id: string) => {
    removeCollectionEntry(cfg.libraryPath, id)
  })

  ipcMain.handle(
    'collection:appendQA',
    async (_, args: { id: string; qa: BriefingCollectionQA[]; qaMessageCount: number }) => {
      appendCollectionQA(cfg.libraryPath, args.id, args.qa, args.qaMessageCount)
    }
  )

  ipcMain.handle('collection:updateNote', async (_, args: { id: string; note: string }) => {
    updateCollectionNote(cfg.libraryPath, args.id, args.note)
  })
}
