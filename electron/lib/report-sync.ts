import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * 交互式可视化报告的学习库同步。
 *
 * 报告数据源为 deconstruct-report skill 模板，build 时由
 * scripts/copy-constitution.js 复制到 out/main/constitution/ 随 asar 打包。
 * boot 时同步到学习库，让报告在学习库中有可独立打开的完整副本。
 *
 * 同步语义：文件缺失或大小不一致时覆盖写入。
 * 本模块不 import 'electron'，保持可单测。
 */

export const CONSTITUTION_REPORT_SUBDIR = path.join('Anthropic博客', 'constitution-report')

export function resolveLibraryReportPath(libraryRoot: string): string {
  return path.join(libraryRoot, CONSTITUTION_REPORT_SUBDIR, 'index.html')
}

export function resolveLibrarySourceDir(libraryRoot: string): string {
  return path.join(libraryRoot, CONSTITUTION_REPORT_SUBDIR, 'source')
}

/** 查找报告打包目录（packaged = asar 内 out/main/constitution/，dev = skill 模板）。 */
export function resolveBundledReportDir(appPath: string, mainDirname: string): string {
  const asarPath = path.join(mainDirname, 'constitution')
  if (fs.existsSync(path.join(asarPath, 'index.html'))) return asarPath
  const skillPath = path.join(
    os.homedir(), '.claude', 'skills', 'deconstruct-report', 'templates', 'constitution'
  )
  if (fs.existsSync(path.join(skillPath, 'index.html'))) return skillPath
  return path.join(appPath, 'constitution')
}

export type ConstitutionSyncResult = {
  reportPath: string
  reportWritten: boolean
  sourceFilesSynced: number
}

function syncOneFile(srcPath: string, destPath: string): boolean {
  const src = fs.readFileSync(srcPath)
  const needCopy = !fs.existsSync(destPath) || fs.statSync(destPath).size !== src.length
  if (!needCopy) return false
  fs.mkdirSync(path.dirname(destPath), { recursive: true })
  fs.writeFileSync(destPath, src)
  return true
}

/**
 * 把报告同步到学习库的单一文件夹下。只写 index.html + source/，不生成索引卡。
 */
export function syncConstitutionReportToLibrary(
  libraryRoot: string,
  bundledReportDir: string
): ConstitutionSyncResult {
  const reportPath = resolveLibraryReportPath(libraryRoot)
  const sourceDir = resolveLibrarySourceDir(libraryRoot)

  const reportWritten = syncOneFile(
    path.join(bundledReportDir, 'index.html'),
    reportPath
  )

  const bundledSourceDir = path.join(bundledReportDir, 'source')
  let sourceFilesSynced = 0
  if (fs.existsSync(bundledSourceDir)) {
    for (const entry of fs.readdirSync(bundledSourceDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      const written = syncOneFile(
        path.join(bundledSourceDir, entry.name),
        path.join(sourceDir, entry.name)
      )
      if (written) sourceFilesSynced++
    }
  }

  return { reportPath, reportWritten, sourceFilesSynced }
}
