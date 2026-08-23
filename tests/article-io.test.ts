import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { writeArticleBody } from '../electron/lib/article-io'

let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'art-io-')) })
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

function write(p: string, c: string) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c) }

describe('writeArticleBody', () => {
  it('越界路径抛 ARTICLE_PATH_FORBIDDEN', () => {
    expect(() => writeArticleBody(dir, path.join(os.tmpdir(), 'x.md'), 'b')).toThrowError(/ARTICLE_PATH_FORBIDDEN/)
  })
  it('保留 frontmatter 只替换正文', () => {
    const p = path.join(dir, 'Anthropic博客', 'x.md')
    write(p, '---\ntitle: T\nsource_url: https://a\n---\n旧正文')
    writeArticleBody(dir, p, '新正文')
    const raw = fs.readFileSync(p, 'utf8')
    expect(raw).toContain('title: T')
    expect(raw).toContain('新正文')
    expect(raw).not.toContain('旧正文')
  })
  it('拾贝目录同样可写', () => {
    const p = path.join(dir, '拾贝', '文章', 'x.md')
    write(p, '---\ntitle: T\n---\n旧')
    writeArticleBody(dir, p, '新')
    expect(fs.readFileSync(p, 'utf8')).toContain('新')
  })
})
