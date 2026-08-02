import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  syncConstitutionReportToLibrary,
  resolveLibraryReportPath,
  resolveLibrarySourceDir,
  CONSTITUTION_REPORT_SUBDIR,
} from '@electron/lib/report-sync'

let tmpRoot: string
let libraryRoot: string
let bundledDir: string

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'report-sync-'))
  libraryRoot = path.join(tmpRoot, 'library')
  fs.mkdirSync(libraryRoot, { recursive: true })
  bundledDir = path.join(tmpRoot, 'bundled-constitution')
  fs.mkdirSync(path.join(bundledDir, 'source'), { recursive: true })
  fs.writeFileSync(path.join(bundledDir, 'index.html'), '<html>constitution report v1</html>')
  fs.writeFileSync(path.join(bundledDir, 'source', 'full-text.md'), '# Original text')
  fs.writeFileSync(path.join(bundledDir, 'source', 'annotations.json'), '{"sections":[]}')
})

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
})

describe('syncConstitutionReportToLibrary', () => {
  it('syncs index.html and source/ into a single folder, no companion .md', () => {
    const result = syncConstitutionReportToLibrary(libraryRoot, bundledDir)

    expect(result.reportWritten).toBe(true)
    expect(result.sourceFilesSynced).toBe(2)

    const reportDir = path.join(libraryRoot, CONSTITUTION_REPORT_SUBDIR)
    expect(fs.readFileSync(resolveLibraryReportPath(libraryRoot), 'utf8')).toBe(
      '<html>constitution report v1</html>'
    )
    const sourceDir = resolveLibrarySourceDir(libraryRoot)
    expect(fs.readFileSync(path.join(sourceDir, 'full-text.md'), 'utf8')).toBe('# Original text')
    expect(fs.readFileSync(path.join(sourceDir, 'annotations.json'), 'utf8')).toBe('{"sections":[]}')

    // 不生成 .md 索引卡
    expect(fs.existsSync(path.join(reportDir, 'README.md'))).toBe(false)

    // 学习库只有这一个文件夹
    const entries = fs.readdirSync(path.join(libraryRoot, 'Anthropic博客'))
    expect(entries).toEqual(['constitution-report'])
  })

  it('is a no-op when all copies are up to date', () => {
    syncConstitutionReportToLibrary(libraryRoot, bundledDir)
    const second = syncConstitutionReportToLibrary(libraryRoot, bundledDir)

    expect(second.reportWritten).toBe(false)
    expect(second.sourceFilesSynced).toBe(0)
  })

  it('re-copies when sizes differ', () => {
    syncConstitutionReportToLibrary(libraryRoot, bundledDir)
    fs.writeFileSync(path.join(bundledDir, 'index.html'), '<html>v2</html>')

    const result = syncConstitutionReportToLibrary(libraryRoot, bundledDir)
    expect(result.reportWritten).toBe(true)
    expect(fs.readFileSync(resolveLibraryReportPath(libraryRoot), 'utf8')).toContain('v2')
  })
})
