import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import type { NoteMeta } from '@shared/index'
import { scanNotes, createNoteFile, updateNoteMeta, deleteNoteFile, importReadNotes } from '../lib/notes'

export function registerNotesIpc(cfg: AppConfig) {
  ipcMain.handle('notes:list', () => scanNotes(cfg.libraryPath))
  ipcMain.handle('notes:create', (_e, a: { title: string; url: string }) => createNoteFile(cfg.libraryPath, a))
  ipcMain.handle('notes:updateMeta', (_e, a: { path: string; patch: Partial<NoteMeta> }) => updateNoteMeta(cfg.libraryPath, a.path, a.patch))
  ipcMain.handle('notes:delete', (_e, a: { path: string }) => deleteNoteFile(cfg.libraryPath, a.path))
  ipcMain.handle('notes:importRead', () => importReadNotes(cfg.libraryPath))
}