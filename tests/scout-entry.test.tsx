import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// 入口契约测试：拾贝必须出现在 sidebar 与 Briefing 分支（feature-development §12：UI 出口）
describe('scout 入口契约', () => {
  it('BriefingSourceSidebar 包含拾贝 nav item 与 testid', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'components', 'BriefingSourceSidebar.tsx'), 'utf8')
    expect(src).toContain("'scout'")
    expect(src).toContain('拾贝')
    expect(src).toContain('briefing-source-scout')
  })

  it('Briefing.tsx 渲染 scout 分支', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'Briefing.tsx'), 'utf8')
    expect(src).toContain("source === 'scout'")
    expect(src).toContain('ScoutPanel')
  })

  it('store briefingSource 恢复逻辑包含 scout', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'store', 'index.ts'), 'utf8')
    expect(src).toMatch(/briefingSource === 'scout'/)
  })
})
