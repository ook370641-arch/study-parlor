import fs from 'node:fs'
import path from 'node:path'
import { safeReadJson, safeWriteJson } from './safe-json'
import type { NotepadItem, NotepadLogEntry } from '@shared/index'

export interface NotepadData {
  notepadItems: NotepadItem[]
  notepadLog: NotepadLogEntry[]
}

export function notepadPathFor(configDir: string): string {
  return path.join(configDir, 'notepad.json')
}

export function loadNotepadData(configDir: string): NotepadData {
  const raw = safeReadJson<Partial<NotepadData>>(notepadPathFor(configDir), { fallback: {} })
  return {
    notepadItems: Array.isArray(raw.notepadItems) ? raw.notepadItems : [],
    notepadLog: Array.isArray(raw.notepadLog) ? raw.notepadLog : [],
  }
}

export function saveNotepadData(configDir: string, data: NotepadData): void {
  safeWriteJson(notepadPathFor(configDir), data)
}

export function migrateNotepadData(configDir: string, stateDir: string): void {
  const stateFile = path.join(stateDir, 'state.json')
  const raw = safeReadJson<Record<string, unknown>>(stateFile, { fallback: {} })

  if (!fs.existsSync(notepadPathFor(configDir))) {
    saveNotepadData(configDir, {
      notepadItems: Array.isArray(raw.notepadItems) ? raw.notepadItems as NotepadItem[] : [],
      notepadLog: Array.isArray(raw.notepadLog) ? raw.notepadLog as NotepadLogEntry[] : [],
    })
  }

  if ('notepadItems' in raw || 'notepadLog' in raw) {
    const next = { ...raw }
    delete next.notepadItems
    delete next.notepadLog
    safeWriteJson(stateFile, next)
  }
}
