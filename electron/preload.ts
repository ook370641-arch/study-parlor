import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, UnsavedSession } from '@shared/index'

const api: IpcApi = {
  scanLibrary: () => ipcRenderer.invoke('files:scan'),
  readMd: (p) => ipcRenderer.invoke('files:read', p),
  writeProgressMd: (a) => ipcRenderer.invoke('files:writeProgress', a),
  writeReviewReport: (a) => ipcRenderer.invoke('files:writeReviewReport', a),
  readAnchorFile: (dirName) => ipcRenderer.invoke('files:readAnchor', dirName),
  writeTranscript: (a) => ipcRenderer.invoke('files:writeTranscript', a),
  readSessionFile: (a) => ipcRenderer.invoke('files:readSessionFile', a),
  recoveryDump: (a) => ipcRenderer.invoke('files:recoveryDump', a),

  getState: () => ipcRenderer.invoke('state:get'),
  patchState: (p) => ipcRenderer.invoke('state:patch', p),

  llmProbe: () => ipcRenderer.invoke('llm:probe'),
  llmStart: (a) => ipcRenderer.invoke('llm:start', a),
  llmAbort: (s) => ipcRenderer.invoke('llm:abort', s),
  llmInspirations: (a) => ipcRenderer.invoke('llm:inspirations', a),
  llmFinalizeProgress: (h) => ipcRenderer.invoke('llm:finalizeProgress', h),
  llmFinalizeReview: (a) => ipcRenderer.invoke('llm:finalizeReview', a),
  llmGenerateFable: (a) => ipcRenderer.invoke('llm:generateFable', a),

  onLlmChunk: (cb) => {
    const handler = (_: unknown, sid: string, text: string) => cb(sid, text)
    ipcRenderer.on('llm:chunk', handler)
    return () => ipcRenderer.off('llm:chunk', handler)
  },
  onLlmDone: (cb) => {
    const handler = (_: unknown, sid: string) => cb(sid)
    ipcRenderer.on('llm:done', handler)
    return () => ipcRenderer.off('llm:done', handler)
  },
  onLlmError: (cb) => {
    const handler = (_: unknown, sid: string, err: { code: string; message: string }) => cb(sid, err)
    ipcRenderer.on('llm:error', handler)
    return () => ipcRenderer.off('llm:error', handler)
  },

  bootFatal: () => ipcRenderer.invoke('boot:fatal'),

  // Session persistence — stubs until main handlers implemented
  loadSessions: async () => [],
  saveSession: async (_s: UnsavedSession) => {},
  deleteSession: async (_id: string) => {}
}

contextBridge.exposeInMainWorld('api', api)
