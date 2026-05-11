import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('deleteArchivedSession', () => {
  const tmpDir = path.join(os.tmpdir(), 'study-parlor-test-' + Date.now())
  const topicDir = path.join(tmpDir, 'TestTopic')
  const sessionDir = path.join(topicDir, 's2')

  beforeEach(() => {
    fs.mkdirSync(sessionDir, { recursive: true })
    fs.writeFileSync(path.join(sessionDir, '学习报告.md'), '# test', 'utf8')
    fs.writeFileSync(path.join(sessionDir, '原始对话.md'), 'test', 'utf8')
  })

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('should delete session directory and all files', () => {
    expect(fs.existsSync(sessionDir)).toBe(true)
    fs.rmSync(sessionDir, { recursive: true, force: true })
    expect(fs.existsSync(sessionDir)).toBe(false)
    expect(fs.existsSync(topicDir)).toBe(true)
  })
})
