import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { AppConfig } from '../env'
import type { AiNoteCandidate, AiNoteProgress, NoteCoverDesign, NoteMeta, NoteSource } from '@shared/index'
import { scanNotes, createNoteFile, updateNoteMeta, deleteNoteFile, importReadNotes, applyAiNote } from '../lib/notes'
import { saveNoteCover } from '../lib/note-covers'
import { generateNoteCoverCandidates } from '../lib/llm-tasks'
import { assembleAiNoteInput, readAiNoteSnapshot } from '../lib/note-ai-source'
import { generateAiNoteBody } from '../lib/note-ai-generation'

type AiNoteEvent = { sender: { send: (channel: string, payload: AiNoteProgress) => void } }
type NotesAiDependencies = {
  generateBody?: typeof generateAiNoteBody
  createId?: () => string
  now?: () => string
}
type CandidateSession = { path: string; baseRawHash: string; aiBody: string }

function ipcError(code: 'ALREADY_GENERATED' | 'ALREADY_RUNNING' | 'NOTE_GENERATION_INVALID'): Error & { code: string } {
  const error = new Error(code) as Error & { code: string }
  error.code = code
  return error
}

export function createNotesAiHandlers(config: AppConfig, dependencies: NotesAiDependencies = {}) {
  const candidates = new Map<string, CandidateSession>()
  const lockedPaths = new Set<string>()
  const generateBody = dependencies.generateBody ?? generateAiNoteBody
  const createId = dependencies.createId ?? randomUUID
  const now = dependencies.now ?? (() => new Date().toISOString())

  return {
    generate: async (event: AiNoteEvent, args: { path: string }): Promise<AiNoteCandidate> => {
      const notePath = args.path.replace(/\\/g, '/')
      const lockKey = process.platform === 'win32' ? notePath.toLowerCase() : notePath
      for (const [generationId, candidate] of candidates) {
        const candidateLockKey = process.platform === 'win32' ? candidate.path.toLowerCase() : candidate.path
        if (candidateLockKey === lockKey) {
          return { generationId, path: candidate.path, body: candidate.aiBody }
        }
      }
      if (lockedPaths.has(lockKey)) throw ipcError('ALREADY_RUNNING')
      lockedPaths.add(lockKey)
      const generationId = createId()
      const emit = (stage: AiNoteProgress['stage']) => event.sender.send('notes:aiProgress', { generationId, path: notePath, stage })
      try {
        emit('reading')
        const snapshot = readAiNoteSnapshot(config.libraryPath, notePath)
        if (snapshot.entry.meta.ai_generated_at) throw ipcError('ALREADY_GENERATED')
        const input = assembleAiNoteInput(config.libraryPath, snapshot)
        const aiBody = await generateBody(config, input, emit)
        candidates.set(generationId, { path: notePath, baseRawHash: snapshot.rawHash, aiBody })
        return { generationId, path: notePath, body: aiBody }
      } catch (error) {
        lockedPaths.delete(lockKey)
        throw error
      }
    },
    apply: async (args: { generationId: string }) => {
      const candidate = candidates.get(args.generationId)
      if (!candidate) throw ipcError('NOTE_GENERATION_INVALID')
      const lockKey = process.platform === 'win32' ? candidate.path.toLowerCase() : candidate.path
      const aiGeneratedAt = now()
      const result = applyAiNote(config.libraryPath, candidate.path, {
        aiBody: candidate.aiBody,
        baseRawHash: candidate.baseRawHash,
        aiGeneratedAt,
      })
      candidates.delete(args.generationId)
      lockedPaths.delete(lockKey)
      return { path: candidate.path, body: result.body, aiGeneratedAt }
    },
    abort: async (args: { generationId: string }): Promise<void> => {
      const candidate = candidates.get(args.generationId)
      if (!candidate) return
      const lockKey = process.platform === 'win32' ? candidate.path.toLowerCase() : candidate.path
      candidates.delete(args.generationId)
      lockedPaths.delete(lockKey)
    },
  }
}

export function registerNotesIpc(cfg: AppConfig) {
  const aiHandlers = createNotesAiHandlers(cfg)
  ipcMain.handle('notes:list', () => scanNotes(cfg.libraryPath))
  ipcMain.handle('notes:create', (_e, a: { title: string; url: string; source?: NoteSource; book?: string; chapter?: string; body?: string }) => createNoteFile(cfg.libraryPath, a))
  ipcMain.handle('notes:updateMeta', (_e, a: { path: string; patch: Partial<NoteMeta> }) => updateNoteMeta(cfg.libraryPath, a.path, a.patch))
  ipcMain.handle('notes:delete', (_e, a: { path: string }) => deleteNoteFile(cfg.libraryPath, a.path))
  ipcMain.handle('notes:importRead', () => importReadNotes(cfg.libraryPath))
  ipcMain.handle('notes:generateCovers', async (_e, a: { path: string }) => ({ candidates: await generateNoteCoverCandidates(cfg, a.path) }))
  ipcMain.handle('notes:saveCover', (_e, a: { path: string; design: NoteCoverDesign }) => saveNoteCover(cfg.libraryPath, a.path, a.design))
  ipcMain.handle('notes:generateAi', (event, a: { path: string }) => aiHandlers.generate(event, a))
  ipcMain.handle('notes:applyAi', (_event, a: { generationId: string }) => aiHandlers.apply(a))
  ipcMain.handle('notes:abortAi', (_event, a: { generationId: string }) => aiHandlers.abort(a))
}
