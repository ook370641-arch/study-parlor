import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/ipc', () => {
  const callbacks = {
    chunk: [] as Array<(sid: string, text: string) => void>,
    done: [] as Array<(sid: string) => void>,
    error: [] as Array<(sid: string, err: { code: string; message: string }) => void>
  }
  return {
    ipc: {
      onLlmChunk: vi.fn((cb: (sid: string, text: string) => void) => {
        callbacks.chunk.push(cb)
        return () => {}
      }),
      onLlmDone: vi.fn((cb: (sid: string) => void) => {
        callbacks.done.push(cb)
        return () => {}
      }),
      onLlmError: vi.fn((cb: (sid: string, err: { code: string; message: string }) => void) => {
        callbacks.error.push(cb)
        return () => {}
      }),
      llmStart: vi.fn(),
      readAnchorFile: vi.fn(),
      saveSession: vi.fn(),
      loadSessions: vi.fn().mockResolvedValue([]),
      patchState: vi.fn()
    },
    __callbacks: callbacks
  }
})

vi.mock('@/lib/paintings', () => ({
  manifest: [{ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }],
  pickRandom: vi.fn(() => ({ id: 'test', painter: 'Test', title: 'Test', url: '/test.jpg' }))
}))

import { ipc } from '@/lib/ipc'
import { attachSessionListeners } from '@/lib/session-runtime'
import { useStore } from '@/store'

// Access callbacks through the module's internal export
// Since vi.mock hoists, we need to use the mocked ipc functions directly
function getRegisteredCallbacks() {
  const chunkFn = vi.mocked(ipc.onLlmChunk).mock.calls
  const doneFn = vi.mocked(ipc.onLlmDone).mock.calls
  const errorFn = vi.mocked(ipc.onLlmError).mock.calls
  return {
    chunk: chunkFn.map(c => c[0]),
    done: doneFn.map(c => c[0]),
    error: errorFn.map(c => c[0])
  }
}

describe('attachSessionListeners', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useStore.setState({
      session: null,
      session_count: 0,
      pendingReports: {},
      unsavedSessions: [],
      toast: null
    })
  })

  it('registers chunk, done, and error listeners', () => {
    attachSessionListeners()
    expect(ipc.onLlmChunk).toHaveBeenCalledOnce()
    expect(ipc.onLlmDone).toHaveBeenCalledOnce()
    expect(ipc.onLlmError).toHaveBeenCalledOnce()
  })

  it('appends chunk when abortId matches', () => {
    attachSessionListeners()
    useStore.getState().startSession({
      mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
    })
    const sid = useStore.getState().session!.abortId

    const cbs = getRegisteredCallbacks()
    cbs.chunk[0](sid, 'Hello')
    expect(useStore.getState().session!.history[0].content).toBe('Hello')
  })

  it('ignores chunk when abortId does not match', () => {
    attachSessionListeners()
    useStore.getState().startSession({
      mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
    })

    const cbs = getRegisteredCallbacks()
    cbs.chunk[0]('wrong-id', 'Hello')
    expect(useStore.getState().session!.history).toHaveLength(0)
  })

  it('ignores chunk when session is null', () => {
    attachSessionListeners()
    const cbs = getRegisteredCallbacks()
    cbs.chunk[0]('any-id', 'Hello')
    expect(useStore.getState().session).toBeNull()
  })

  it('calls finishStreaming on done when abortId matches', () => {
    attachSessionListeners()
    useStore.getState().startSession({
      mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
    })
    useStore.getState().appendChunk('Done')
    const sid = useStore.getState().session!.abortId

    const cbs = getRegisteredCallbacks()
    cbs.done[0](sid)
    expect(useStore.getState().session!.streaming).toBe(false)
  })

  it('ignores done when abortId does not match', () => {
    attachSessionListeners()
    useStore.getState().startSession({
      mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
    })
    useStore.getState().appendChunk('partial')

    const cbs = getRegisteredCallbacks()
    cbs.done[0]('wrong-id')
    expect(useStore.getState().session!.streaming).toBe(true)
  })

  it('calls finishStreaming and shows toast on error when abortId matches', () => {
    attachSessionListeners()
    useStore.getState().startSession({
      mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
    })
    useStore.getState().appendChunk('partial')
    const sid = useStore.getState().session!.abortId

    const cbs = getRegisteredCallbacks()
    cbs.error[0](sid, { code: 'ERR', message: 'network fail' })
    expect(useStore.getState().session!.streaming).toBe(false)
    expect(useStore.getState().toast).not.toBeNull()
    expect(useStore.getState().toast!.message).toContain('network fail')
  })

  it('ignores error when abortId does not match', () => {
    attachSessionListeners()
    useStore.getState().startSession({
      mode: 'progress', topic: 'A', difficulty: 'mid', temperature: 0.7
    })
    useStore.getState().appendChunk('partial')

    const cbs = getRegisteredCallbacks()
    cbs.error[0]('wrong-id', { code: 'ERR', message: 'fail' })
    expect(useStore.getState().session!.streaming).toBe(true)
    expect(useStore.getState().toast).toBeNull()
  })
})
