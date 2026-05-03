// src/lib/ipc.ts —— renderer 侧的 typed facade
import type { IpcApi } from '@shared/index'

const ensure = (): IpcApi => {
  if (!window.api) throw new Error('window.api missing — preload not wired?')
  return window.api
}

export const ipc = {
  get scanLibrary() { return ensure().scanLibrary },
  get readMd() { return ensure().readMd },
  get writeProgressMd() { return ensure().writeProgressMd },
  get appendReviewRecord() { return ensure().appendReviewRecord },
  get getState() { return ensure().getState },
  get patchState() { return ensure().patchState },
  get llmProbe() { return ensure().llmProbe },
  get llmStart() { return ensure().llmStart },
  get llmAbort() { return ensure().llmAbort },
  get llmInspirations() { return ensure().llmInspirations },
  get llmFinalizeProgress() { return ensure().llmFinalizeProgress },
  get llmFinalizeReview() { return ensure().llmFinalizeReview },
  get onLlmChunk() { return ensure().onLlmChunk },
  get onLlmDone() { return ensure().onLlmDone },
  get onLlmError() { return ensure().onLlmError }
}
