import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, UnsavedSession } from '@shared/index'

const api: IpcApi = {
  scanLibrary: () => ipcRenderer.invoke('files:scan'),
  readMd: (p) => ipcRenderer.invoke('files:read', p),
  writeProgressMd: (a) => ipcRenderer.invoke('files:writeProgress', a),
  writeReviewReport: (a) => ipcRenderer.invoke('files:writeReviewReport', a),
  readAnchorFile: (dirName) => ipcRenderer.invoke('files:readAnchor', dirName),
  writeTranscript: (a) => ipcRenderer.invoke('files:writeTranscript', a),
  writeFable: (a) => ipcRenderer.invoke('files:writeFable', a),
  readSessionFile: (a) => ipcRenderer.invoke('files:readSessionFile', a),
  recoveryDump: (a) => ipcRenderer.invoke('files:recoveryDump', a),

  loadGroups: () => ipcRenderer.invoke('groups:load'),
  updateGroupMapping: (m) => ipcRenderer.invoke('groups:updateMapping', m),
  createGroup: (name, color) => ipcRenderer.invoke('groups:create', name, color),
  renameGroup: (id, name) => ipcRenderer.invoke('groups:rename', id, name),
  deleteGroup: (id, fallbackId) => ipcRenderer.invoke('groups:delete', id, fallbackId),
  deleteArchivedSession: (a) => ipcRenderer.invoke('files:deleteArchivedSession', a),

  getState: () => ipcRenderer.invoke('state:get'),
  patchState: (p) => ipcRenderer.invoke('state:patch', p),

  llmProbe: () => ipcRenderer.invoke('llm:probe'),
  llmStart: (a) => ipcRenderer.invoke('llm:start', a),
  llmAbort: (s) => ipcRenderer.invoke('llm:abort', s),
  llmInspirations: (a) => ipcRenderer.invoke('llm:inspirations', a),
  llmFinalizeProgress: (h) => ipcRenderer.invoke('llm:finalizeProgress', h),
  llmFinalizeReview: (a) => ipcRenderer.invoke('llm:finalizeReview', a),
  llmGenerateFable: (a) => ipcRenderer.invoke('llm:generateFable', a),
  llmGroupInspiration: (a) => ipcRenderer.invoke('llm:groupInspiration', a),
  llmGenerateFableFromReport: (a) => ipcRenderer.invoke('llm:generateFableFromReport', a),
  llmGenerateContinueSuggestions: (a) => ipcRenderer.invoke('llm:generateContinueSuggestions', a),
  llmGenerateDiagram: (a) => ipcRenderer.invoke('llm:generateDiagram', a),

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
  getExtensionInfo: () => ipcRenderer.invoke('files:getExtensionInfo'),

  // Setup wizard
  bootNeedsSetup: () =>
    ipcRenderer.invoke('boot:needsSetup') as Promise<boolean>,
  setupSelectDirectory: () =>
    ipcRenderer.invoke('setup:selectDirectory') as Promise<{ canceled: boolean; path: string | null }>,
  setupProbeKey: (args) =>
    ipcRenderer.invoke('setup:probeKey', args),
  setupWriteConfig: (args) =>
    ipcRenderer.invoke('setup:writeConfig', args),
  onSetupDone: (cb) => {
    const handler = () => cb()
    ipcRenderer.on('setup:done', handler)
    return () => ipcRenderer.off('setup:done', handler)
  },

  bootStart: () => ipcRenderer.invoke('boot:start'),

  onBootProgress: (cb: (stage: string, progress: number) => void) => {
    const handler = (_: unknown, stage: string, progress: number) => cb(stage, progress)
    ipcRenderer.on('boot:progress', handler)
    return () => ipcRenderer.off('boot:progress', handler)
  },
  onBootComplete: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('boot:complete', handler)
    return () => ipcRenderer.off('boot:complete', handler)
  },

  loadSessions: () => ipcRenderer.invoke('sessions:load'),
  saveSession: (s) => ipcRenderer.invoke('sessions:save', s),
  deleteSession: (id) => ipcRenderer.invoke('sessions:delete', id),
}

contextBridge.exposeInMainWorld('api', api)
