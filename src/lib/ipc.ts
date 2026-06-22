// src/lib/ipc.ts —— renderer 侧的 typed facade
import type { IpcApi } from '@shared/index'

const ensure = (): IpcApi => {
  if (!window.api) throw new Error('window.api missing — preload not wired?')
  return window.api
}

export const ipc = {
  get scanLibrary() { return ensure().scanLibrary },
  get readMd() { return ensure().readMd },
  get readAnchorFile() { return ensure().readAnchorFile },
  get writeProgressMd() { return ensure().writeProgressMd },
  get writeReviewReport() { return ensure().writeReviewReport },
  get writeTranscript() { return ensure().writeTranscript },
  get writeFable() { return ensure().writeFable },
  get readSessionFile() { return ensure().readSessionFile },
  get readExternalMaterials() { return ensure().readExternalMaterials },
  get getState() { return ensure().getState },
  get patchState() { return ensure().patchState },
  get llmProbe() { return ensure().llmProbe },
  get llmStart() { return ensure().llmStart },
  get llmAbort() { return ensure().llmAbort },
  get llmFinalizeProgress() { return ensure().llmFinalizeProgress },
  get llmFinalizeReview() { return ensure().llmFinalizeReview },
  get llmGenerateFable() { return ensure().llmGenerateFable },
  get llmGroupInspiration() { return ensure().llmGroupInspiration },
  get llmWildcardInspiration() { return ensure().llmWildcardInspiration },
  get llmGenerateFableFromReport() { return ensure().llmGenerateFableFromReport },
  get llmGenerateContinueSuggestions() { return ensure().llmGenerateContinueSuggestions },
  get llmGenerateDiagram() { return ensure().llmGenerateDiagram },
  get onLlmChunk() { return ensure().onLlmChunk },
  get onLlmDone() { return ensure().onLlmDone },
  get onLlmError() { return ensure().onLlmError },
  get saveSession() { return ensure().saveSession },
  get loadSessions() { return ensure().loadSessions },
  get deleteSession() { return ensure().deleteSession },
  get loadGroups() { return ensure().loadGroups },
  get updateGroupMapping() { return ensure().updateGroupMapping },
  get createGroup() { return ensure().createGroup },
  get renameGroup() { return ensure().renameGroup },
  get deleteGroup() { return ensure().deleteGroup },
  get deleteArchivedSession() { return ensure().deleteArchivedSession },
  get recoveryDump() { return ensure().recoveryDump },
  get bootFatal() { return ensure().bootFatal },
  get onBootProgress() { return ensure().onBootProgress },
  get onBootComplete() { return ensure().onBootComplete },
  get getExtensionInfo() { return ensure().getExtensionInfo },

  // Search & external materials
  get searchPrepare() { return ensure().searchPrepare },
  get searchCheckConfig() { return ensure().searchCheckConfig },
  get setSearchApiKey() { return ensure().setSearchApiKey },
  get writeExternalMaterials() { return ensure().writeExternalMaterials },

  // Config
  get getConfig() { return ensure().getConfig },
  get writeConfig() { return ensure().writeConfig },

  // Setup wizard
  get bootNeedsSetup() { return ensure().bootNeedsSetup },
  get setupSelectDirectory() { return ensure().setupSelectDirectory },
  get setupProbeKey() { return ensure().setupProbeKey },
  get setupWriteConfig() { return ensure().setupWriteConfig },
  get onSetupDone() { return ensure().onSetupDone },

  get briefingGenerate() { return ensure().briefingGenerate },
  get briefingList() { return ensure().briefingList }
}
