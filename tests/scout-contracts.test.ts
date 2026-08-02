import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 契约测试：拾贝文件夹必须被 files:scan 排除（点亮灯火/推荐逻辑不可见）
describe('scout contracts', () => {
  it('files:scan excludes 拾贝 directory', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'files.ts'), 'utf8')
    const m = src.match(/\[(['\w\u4e00-\u9fff,\s]*'拾贝'[\w\u4e00-\u9fff',\s]*)\]\.includes\(td\)/)
    expect(m, 'files.ts exclusion list must include 拾贝').toBeTruthy()
  })

  it('state DEFAULT includes scout fields', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'electron', 'ipc', 'state.ts'), 'utf8')
    expect(src).toContain("scoutTab: 'chat'")
    expect(src).toContain('scoutActiveConversationId: null')
  })
})
