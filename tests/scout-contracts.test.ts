import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 契约测试：files:scan 只读苏格拉底对话/ 子目录（点亮灯火/推荐逻辑不可见拾贝）
describe('scout contracts', () => {
  it('files:scan reads topics from 苏格拉底对话 subdirectory, so 拾贝 is never a topic', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'files.ts'), 'utf8')
    const scanHandler = src.slice(src.indexOf('files:scan'), src.indexOf('files:read'))
    expect(scanHandler).toContain('苏格拉底对话')
  })

  it('state DEFAULT includes scout fields', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'state.ts'), 'utf8')
    expect(src).toContain("scoutTab: 'chat'")
    expect(src).toContain('scoutActiveConversationId: null')
  })
})
