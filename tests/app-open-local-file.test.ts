// app:openLocalFile handler 级测试——写作笔记 file:// 链接的系统打开入口。
// 边界:非 file 协议拒绝、文件不存在抛 FILE_NOT_FOUND、中文路径百分号解码。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const handlers = vi.hoisted(() => ({}) as Record<string, (event: unknown, url: string) => Promise<unknown>>)
const openPath = vi.hoisted(() => vi.fn(async () => ''))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown, url: string) => Promise<unknown>) => {
      handlers[channel] = fn
    },
  },
  shell: { openPath, openExternal: vi.fn(async () => undefined) },
}))

import { registerAppIpc } from '../electron/ipc/app'

describe('app:openLocalFile', () => {
  beforeEach(() => {
    registerAppIpc()
    openPath.mockClear()
  })

  it('rejects non-file URLs without touching the shell', async () => {
    await expect(handlers['app:openLocalFile'](null, 'https://example.com')).rejects.toThrow('Invalid file URL')
    await expect(handlers['app:openLocalFile'](null, 'javascript:alert(1)')).rejects.toThrow('Invalid file URL')
    expect(openPath).not.toHaveBeenCalled()
  })

  it('throws FILE_NOT_FOUND for missing files', async () => {
    const missing = path.join(os.tmpdir(), 'study-parlor-no-such-file.html')
    await expect(handlers['app:openLocalFile'](null, pathToFileURL(missing).href)).rejects.toThrow(/文件不存在/)
    expect(openPath).not.toHaveBeenCalled()
  })

  it('opens an existing file via shell.openPath with percent-decoded path', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), '日报-'))
    const file = path.join(dir, '8.16.html')
    fs.writeFileSync(file, '<html></html>')
    try {
      await handlers['app:openLocalFile'](null, pathToFileURL(file).href)
      expect(openPath).toHaveBeenCalledWith(file)
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
