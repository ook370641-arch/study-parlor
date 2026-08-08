import { contextBridge, ipcRenderer } from 'electron'
import type { IpcApi, UnsavedSession, BriefingStage, BriefingProgressSource } from '@shared/index'

const api: IpcApi = {
  scanLibrary: () => ipcRenderer.invoke('files:scan'),
  readMd: (p) => ipcRenderer.invoke('files:read', p),
  readAssetAsDataUrl: (mdFilePath, relativePath) => ipcRenderer.invoke('files:readAssetAsDataUrl', mdFilePath, relativePath),
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
  llmFinalizeProgress: (h) => ipcRenderer.invoke('llm:finalizeProgress', h),
  llmFinalizeReview: (a) => ipcRenderer.invoke('llm:finalizeReview', a),
  llmGenerateFable: (a) => ipcRenderer.invoke('llm:generateFable', a),
  llmGroupInspiration: (a) => ipcRenderer.invoke('llm:groupInspiration', a),
  llmGenerateFableFromReport: (a) => ipcRenderer.invoke('llm:generateFableFromReport', a),
  llmGenerateContinueSuggestions: (a) => ipcRenderer.invoke('llm:generateContinueSuggestions', a),
  llmGenerateDiagram: (a) => ipcRenderer.invoke('llm:generateDiagram', a),
  llmWildcardInspiration: (a) => ipcRenderer.invoke('llm:wildcardInspiration', a),

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
  onArticleAssistantSearchDone: (cb) => {
    const handler = (_: unknown, sessionId: string, payload: { searchSources?: { title: string; url: string; snippet: string }[]; searchError?: 'NO_RESULTS' | 'SEARCH_ERROR' }) => cb(sessionId, payload)
    ipcRenderer.on('articleAssistant:searchDone', handler)
    return () => ipcRenderer.off('articleAssistant:searchDone', handler)
  },
  onArticleAssistantReasoningChunk: (cb) => {
    const handler = (_: unknown, sessionId: string, text: string) => cb(sessionId, text)
    ipcRenderer.on('articleAssistant:reasoningChunk', handler)
    return () => ipcRenderer.off('articleAssistant:reasoningChunk', handler)
  },
  onArticleAssistantGuideProgress: (cb) => {
    const handler = (_e: unknown, payload: unknown) => cb(payload as import('@shared/index').GuideProgress)
    ipcRenderer.on('articleAssistant:guideProgress', handler)
    return () => ipcRenderer.off('articleAssistant:guideProgress', handler)
  },

  bootFatal: () => ipcRenderer.invoke('boot:fatal'),
  getExtensionInfo: () => ipcRenderer.invoke('files:getExtensionInfo'),

  // External materials
  readExternalMaterials: (dirName) => ipcRenderer.invoke('files:readExternalMaterials', dirName),
  writeExternalMaterials: (a) => ipcRenderer.invoke('files:writeExternalMaterials', a),

  // Search
  searchPrepare: (a) => ipcRenderer.invoke('search:prepare', a),
  searchCheckConfig: () => ipcRenderer.invoke('search:checkConfig'),
  setSearchApiKey: (key) => ipcRenderer.invoke('search:setApiKey', key),

  // Config
  getConfig: () => ipcRenderer.invoke('config:get'),
  writeConfig: (config) => ipcRenderer.invoke('config:write', config),

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

  briefingGenerate: (args) => ipcRenderer.invoke('briefing:generate', args),
  briefingList: () => ipcRenderer.invoke('briefing:list'),
  briefingDelete: (args) => ipcRenderer.invoke('briefing:delete', args),
  briefingAbort: () => ipcRenderer.invoke('briefing:abort'),

  jobBriefingGenerate: (args) => ipcRenderer.invoke('job-briefing:generate', args),
  jobBriefingList: () => ipcRenderer.invoke('job-briefing:list'),
  jobBriefingDiscoverPages: () => ipcRenderer.invoke('job-briefing:discover-pages'),
  jobBriefingDelete: (args) => ipcRenderer.invoke('job-briefing:delete', args),
  jobBriefingAbort: () => ipcRenderer.invoke('job-briefing:abort'),
  jobBriefingGenerateKeywords: (args: { profile: import('@shared/index').JobProfile }) =>
    ipcRenderer.invoke('job-briefing:generate-keywords', args),
  jobBriefingGenerateArticleSearchQuery: (args: { articleContent: string; selection?: string; lastMessage?: string }) =>
    ipcRenderer.invoke('job-briefing:generate-article-search-query', args),

  anthropicDiscover: () => ipcRenderer.invoke('anthropic:discover'),
  anthropicImportArticle: (url) => ipcRenderer.invoke('anthropic:importArticle', url),
  anthropicCancelImport: () => ipcRenderer.invoke('anthropic:cancelImport'),
  anthropicDeleteArticle: (a) => ipcRenderer.invoke('anthropic:deleteArticle', a),

  annotationsRead: (articlePath) => ipcRenderer.invoke('annotations:read', articlePath),
  annotationsWrite: (articlePath, annotations) => ipcRenderer.invoke('annotations:write', articlePath, annotations),

  collectionRead: () => ipcRenderer.invoke('collection:read'),
  collectionAddEntry: (entry) => ipcRenderer.invoke('collection:addEntry', entry),
  collectionRemoveEntry: (id) => ipcRenderer.invoke('collection:removeEntry', id),
  collectionAppendQA: (args) => ipcRenderer.invoke('collection:appendQA', args),
  collectionUpdateNote: (args) => ipcRenderer.invoke('collection:updateNote', args),
  collectionUpdateQA: (args) => ipcRenderer.invoke('collection:updateQA', args),

  articleAssistantGenerateGuide: (a) => ipcRenderer.invoke('articleAssistant:generateGuide', a),
  articleAssistantSendMessage: (a) => ipcRenderer.invoke('articleAssistant:sendMessage', a),
  articleAssistantAbort: (a) => ipcRenderer.invoke('articleAssistant:abort', a),
  articleAssistantReadSession: (a) => ipcRenderer.invoke('articleAssistant:readSession', a),
  articleAssistantWriteSession: (a) => ipcRenderer.invoke('articleAssistant:writeSession', a),
  articleAssistantReadGuide: (a) => ipcRenderer.invoke('articleAssistant:readGuide', a),
  articleAssistantWriteGuide: (a) => ipcRenderer.invoke('articleAssistant:writeGuide', a),

  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url),

  // Timing instrumentation — fire-and-forget so renderer doesn't await
  logTiming: (label, elapsed) => ipcRenderer.send('log:timing', label, elapsed),

  onBriefingProgress: (cb) => {
    // Per-handler on/off：digest 与 job-briefing 可同时订阅同一频道（后台生成 +
    // 查看并存），removeAllListeners 会互相残杀（React "Should have a queue" root cause）。
    const handler = (_: unknown, source: BriefingProgressSource, stage: BriefingStage, detail?: string) => cb(source, stage, detail)
    ipcRenderer.on('briefing:progress', handler)
    return () => ipcRenderer.off('briefing:progress', handler)
  },

  bootStart: () => ipcRenderer.invoke('boot:start') as Promise<{ alreadyCompleted: boolean }>,

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

  // Writing feature
  writingScanTree: () => ipcRenderer.invoke('writing:scanTree'),
  writingCreateFile: (a) => ipcRenderer.invoke('writing:createFile', a),
  writingCreateFolder: (a) => ipcRenderer.invoke('writing:createFolder', a),
  writingRename: (a) => ipcRenderer.invoke('writing:rename', a),
  writingMove: (a) => ipcRenderer.invoke('writing:move', a),
  writingDelete: (a) => ipcRenderer.invoke('writing:delete', a),
  writingRead: (a) => ipcRenderer.invoke('writing:read', a),
  writingWrite: (a) => ipcRenderer.invoke('writing:write', a),
  writingImportFiles: (a) => ipcRenderer.invoke('writing:importFiles', a),
  writingAssistantSendMessage: (a) => ipcRenderer.invoke('writingAssistant:sendMessage', a),
  writingAssistantAbort: (a) => ipcRenderer.invoke('writingAssistant:abort', a),
  onWritingAssistantTool: (cb) => {
    const handler = (_: unknown, payload: any) => cb(payload)
    ipcRenderer.on('writingAssistant:tool', handler)
    return () => ipcRenderer.removeListener('writingAssistant:tool', handler)
  },
  onWritingAssistantReasoningChunk: (cb) => {
    const handler = (_: unknown, sessionId: string, text: string) => cb(sessionId, text)
    ipcRenderer.on('writingAssistant:reasoningChunk', handler)
    return () => ipcRenderer.removeListener('writingAssistant:reasoningChunk', handler)
  },

  // Scout (拾贝)
  scoutSendMessage: (a) => ipcRenderer.invoke('scout:sendMessage', a),
  scoutAbort: (a) => ipcRenderer.invoke('scout:abort', a),
  scoutListConversations: () => ipcRenderer.invoke('scout:listConversations'),
  scoutCreateConversation: () => ipcRenderer.invoke('scout:createConversation'),
  scoutGetConversation: (a) => ipcRenderer.invoke('scout:getConversation', a),
  scoutRenameConversation: (a) => ipcRenderer.invoke('scout:renameConversation', a),
  scoutDeleteConversation: (a) => ipcRenderer.invoke('scout:deleteConversation', a),
  scoutListArticles: () => ipcRenderer.invoke('scout:listArticles'),
  scoutDeleteArticle: (a) => ipcRenderer.invoke('scout:deleteArticle', a),
  onScoutTool: (cb) => {
    const handler = (_: unknown, payload: any) => cb(payload)
    ipcRenderer.on('scout:tool', handler)
    return () => ipcRenderer.removeListener('scout:tool', handler)
  },
}

contextBridge.exposeInMainWorld('api', api)
