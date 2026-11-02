import { ipcMain } from 'electron'
import type { AppConfig } from '../env'
import type { NoteCoverDesign, NoteMeta, NoteSource } from '@shared/index'
import { scanNotes, createNoteFile, updateNoteMeta, deleteNoteFile, importReadNotes } from '../lib/notes'
import { saveNoteCover } from '../lib/note-covers'
import { generateNoteCoverCandidates } from '../lib/llm-tasks'

export function registerNotesIpc(cfg: AppConfig) {
  ipcMain.handle('notes:list', () => scanNotes(cfg.libraryPath))
  ipcMain.handle('notes:create', (_e, a: { title: string; url: string; source?: NoteSource; book?: string; chapter?: string; body?: string }) => createNoteFile(cfg.libraryPath, a))
  ipcMain.handle('notes:updateMeta', (_e, a: { path: string; patch: Partial<NoteMeta> }) => updateNoteMeta(cfg.libraryPath, a.path, a.patch))
  ipcMain.handle('notes:delete', (_e, a: { path: string }) => deleteNoteFile(cfg.libraryPath, a.path))
  ipcMain.handle('notes:importRead', () => importReadNotes(cfg.libraryPath))
  ipcMain.handle('notes:generateCovers', async (_e, a: { path: string }) => ({ candidates: await generateNoteCoverCandidates(cfg, a.path) }))
  ipcMain.handle('notes:saveCover', (_e, a: { path: string; design: NoteCoverDesign }) => saveNoteCover(cfg.libraryPath, a.path, a.design))
}
